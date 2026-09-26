import test from "node:test";
import assert from "node:assert/strict";
import Database from "better-sqlite3";
import { randomBytes } from "node:crypto";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { execFile } from "node:child_process";
import { openDatabase } from "../src/server/database.js";
import { createBackup, parseBackupKey, restoreBackup, verifyBackup } from "../src/server/backups.js";
import { createBackupWorker } from "../src/server/backup-worker.js";
import { encryptSecret, decryptSecret } from "../src/server/security.js";

const execute = promisify(execFile);
const oauthKey = "isolated-backup-test-encryption-key";

async function fixture(context) {
  const root = await mkdtemp(join(tmpdir(), "sap-backup-test-"));
  const source = join(root, "source.sqlite");
  const database = openDatabase(source);
  database.pragma("wal_autocheckpoint = 0");
  context.after(async () => {
    if (database.open) database.close();
    await rm(root, { recursive: true, force: true });
  });
  database.exec(`
    INSERT INTO organizations (id, name, slug) VALUES (1, 'Empresa Prueba', 'empresa-prueba');
    INSERT INTO users (id, display_name, email, password_hash, role_slug, default_organization_id,
      mfa_enabled, mfa_pending_secret_encrypted, mfa_recovery_codes_json)
      VALUES (1, 'Cuenta Prueba', 'backup@example.test', 'hash-test', 'admin', 1, 1, 'pending', '["old-code-hash"]');
    INSERT INTO organization_members (organization_id, user_id, role_slug) VALUES (1, 1, 'admin');
    INSERT INTO sessions (token_hash, user_id, organization_id, csrf_token, expires_at)
      VALUES ('old-session-hash', 1, 1, 'csrf-test', datetime('now', '+1 day'));
    INSERT INTO auth_tokens (user_id, purpose, token_hash, expires_at)
      VALUES (1, 'password_reset', 'old-reset-hash', datetime('now', '+1 day'));
    INSERT INTO oauth_states (state_hash, user_id, platform_slug, expires_at)
      VALUES ('old-state-hash', 1, 'youtube', datetime('now', '+1 day'));
    INSERT INTO reports (title, content_json, created_by, organization_id)
      VALUES ('Informe de prueba', '{"value":42}', 1, 1);
  `);
  database.prepare(`INSERT INTO oauth_connections (id, user_id, organization_id, platform_slug,
    external_account_id, display_name, access_token_encrypted) VALUES (1, 1, 1, 'youtube', 'test', 'Canal', ?)`)
    .run(encryptSecret("isolated-test-token", oauthKey));
  database.exec(`
    INSERT INTO sync_schedules (organization_id, connection_id, lease_owner, lease_expires_at)
      VALUES (1, 1, 'old-worker', datetime('now', '+10 minutes'));
    INSERT INTO oauth_sync_runs (connection_id, status) VALUES (1, 'running');
  `);
  return { root, source, database, directory: join(root, "backups"), encryptionKey: randomBytes(32).toString("hex"),
    temporaryDirectory: join(root, "temporary") };
}

test("respalda WAL cifrado y restaura datos sin sesiones ni tareas activas", async (context) => {
  const options = await fixture(context);
  const backup = await createBackup(options);
  assert.equal(backup.verified, true);
  assert.deepEqual((await readdir(backup.directory)).sort(), ["database.enc", "manifest.json"]);
  const encrypted = await readFile(join(backup.directory, "database.enc"));
  assert.equal(encrypted.includes(Buffer.from("backup@example.test")), false);
  assert.notEqual(encrypted.subarray(0, 6).toString(), "SQLite");
  const verification = await verifyBackup({ ...options, directory: backup.directory });
  assert.equal(verification.migrations.length, 6);
  const target = join(options.root, "restored.sqlite");
  await restoreBackup({ ...options, directory: backup.directory, target });
  const restored = new Database(target);
  try {
    assert.equal(restored.prepare("SELECT title FROM reports").get().title, "Informe de prueba");
    assert.equal(restored.prepare("SELECT organization_id FROM reports").get().organization_id, 1);
    for (const table of ["sessions", "auth_tokens", "oauth_states"]) {
      assert.equal(restored.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get().count, 0);
    }
    assert.deepEqual(restored.prepare("SELECT enabled, lease_owner, lease_expires_at FROM sync_schedules").get(),
      { enabled: 0, lease_owner: null, lease_expires_at: null });
    assert.equal(restored.prepare("SELECT status FROM oauth_sync_runs").get().status, "failed");
    assert.equal(restored.prepare("SELECT mfa_recovery_codes_json FROM users").get().mfa_recovery_codes_json, "[]");
    assert.equal(restored.prepare("SELECT mfa_enabled FROM users").get().mfa_enabled, 1);
    const connection = restored.prepare("SELECT access_token_encrypted FROM oauth_connections").get();
    assert.equal(decryptSecret(connection.access_token_encrypted, oauthKey), "isolated-test-token");
    assert.equal(restored.prepare("SELECT action FROM activity_logs").get().action, "system.backup_restored");
  } finally { restored.close(); }
  assert.equal(options.database.prepare("SELECT COUNT(*) AS count FROM sessions").get().count, 1);
  assert.equal(options.database.prepare("SELECT enabled FROM sync_schedules").get().enabled, 1);
  assert.deepEqual(await readdir(options.temporaryDirectory), []);
});

test("rechaza claves ausentes o incorrectas y limpia archivos temporales", async (context) => {
  const options = await fixture(context);
  assert.throws(() => parseBackupKey("password"), /64 caracteres/);
  await assert.rejects(createBackup({ ...options, encryptionKey: undefined }), /BACKUP_ENCRYPTION_KEY/);
  const backup = await createBackup(options);
  await assert.rejects(restoreBackup({ ...options, directory: backup.directory,
    encryptionKey: randomBytes(32).toString("hex"), target: join(options.root, "wrong.sqlite") }), /autenticar/);
  assert.deepEqual(await readdir(options.temporaryDirectory), []);
  assert.equal((await readdir(options.root)).includes("wrong.sqlite"), false);
});

test("detecta manipulacion del cifrado y del manifiesto sin publicar una restauracion", async (context) => {
  const options = await fixture(context);
  const backup = await createBackup(options);
  const path = join(backup.directory, "database.enc");
  const original = await readFile(path);
  const changed = Buffer.from(original);
  changed[100] ^= 1;
  await writeFile(path, changed);
  await assert.rejects(verifyBackup({ ...options, directory: backup.directory }), /autenticar/);
  await writeFile(path, original);
  const manifestPath = join(backup.directory, "manifest.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  await writeFile(manifestPath, JSON.stringify({ ...manifest, createdAt: "2000-01-01T00:00:00.000Z" }));
  await assert.rejects(verifyBackup({ ...options, directory: backup.directory }), /autenticar/);
  manifest.sha256 = "0".repeat(64);
  await writeFile(manifestPath, JSON.stringify(manifest));
  await assert.rejects(verifyBackup({ ...options, directory: backup.directory }), /SHA-256/);
  manifest.version = 99;
  await writeFile(manifestPath, JSON.stringify(manifest));
  await assert.rejects(verifyBackup({ ...options, directory: backup.directory }), /no admitido/);
});

test("restaurar nunca sobrescribe archivos existentes ni bases con WAL residual", async (context) => {
  const options = await fixture(context);
  const backup = await createBackup(options);
  const target = join(options.root, "important.sqlite");
  await writeFile(target, "conservar");
  await assert.rejects(restoreBackup({ ...options, directory: backup.directory, target }), /ya existen/);
  assert.equal(await readFile(target, "utf8"), "conservar");
  await assert.rejects(restoreBackup({ ...options, directory: backup.directory, target: options.source }), /ya existen/);
  const residual = join(options.root, "residual.sqlite");
  await writeFile(residual + "-wal", "conservar-wal");
  await assert.rejects(restoreBackup({ ...options, directory: backup.directory, target: residual }), /ya existen/);
});

test("una base con referencias invalidas no produce una copia valida", async (context) => {
  const options = await fixture(context);
  options.database.pragma("foreign_keys = OFF");
  options.database.prepare("UPDATE reports SET organization_id = 999").run();
  await assert.rejects(createBackup(options), /referencias invalidas/);
  const [bundle] = await readdir(options.directory);
  assert.deepEqual(await readdir(join(options.directory, bundle)), []);
});

test("los comandos de copia verificacion y restauracion funcionan de extremo a extremo", async (context) => {
  const options = await fixture(context);
  const env = { ...process.env, DATABASE_PATH: options.source, BACKUP_ENCRYPTION_KEY: options.encryptionKey };
  const cli = join(import.meta.dirname, "../scripts/database-backup.js");
  const execution = { env, cwd: options.root };
  const backup = JSON.parse((await execute(process.execPath, [cli, "create", options.directory], execution)).stdout);
  const verification = JSON.parse((await execute(process.execPath, [cli, "verify", backup.directory], execution)).stdout);
  assert.equal(verification.verified, true);
  const target = join(options.root, "from-cli.sqlite");
  const restore = JSON.parse((await execute(process.execPath, [cli, "restore", backup.directory, target], execution)).stdout);
  assert.equal(restore.restored, true);
  await assert.rejects(execute(process.execPath, [cli, "restore", backup.directory, target], execution), (error) => error.code === 1);
});

test("el trabajador no solapa copias y espera la copia activa al detenerse", async () => {
  let finish;
  let calls = 0;
  const events = [];
  const worker = createBackupWorker({ intervalHours: 0, log: (event) => events.push(event),
    backup: () => { calls += 1; return new Promise((resolve) => { finish = resolve; }); } });
  const first = worker.runOnce();
  const second = worker.runOnce();
  assert.equal(first, second);
  await new Promise((resolve) => setImmediate(resolve));
  const stopping = worker.stop();
  assert.equal(calls, 1);
  finish({ bytes: 123 });
  await stopping;
  assert.equal(await worker.runOnce(), null);
  assert.equal(events[0].event, "backup.completed");
});

test("las copias periodicas validan configuracion y notifican fallos sin revelar secretos", async () => {
  assert.throws(() => createBackupWorker({ intervalHours: NaN }), /BACKUP_INTERVAL_HOURS/);
  assert.throws(() => createBackupWorker({ intervalHours: 1, encryptionKey: "invalid" }), /BACKUP_ENCRYPTION_KEY/);
  const events = [];
  const worker = createBackupWorker({ intervalHours: 1, encryptionKey: randomBytes(32).toString("hex"),
    log: (event) => events.push(event), backup: async () => { throw new Error("private-secret"); } });
  worker.start();
  await worker.stop();
  assert.equal(events[0].event, "backup.failed");
  assert.equal(JSON.stringify(events).includes("private-secret"), false);
  let calls = 0;
  const disabled = createBackupWorker({ intervalHours: 0, backup: async () => { calls += 1; } });
  disabled.start();
  await disabled.stop();
  assert.equal(calls, 0);
});

test("la programacion repite copias al vencer el intervalo y se cancela al cerrar", async (context) => {
  context.mock.timers.enable({ apis: ["setInterval"] });
  let calls = 0;
  const worker = createBackupWorker({ intervalHours: 1, encryptionKey: randomBytes(32).toString("hex"),
    log: () => {}, backup: async () => { calls += 1; return { bytes: 12 }; } });
  context.after(() => worker.stop());
  worker.start();
  await worker.runOnce();
  assert.equal(calls, 1);
  context.mock.timers.tick(3600000);
  await worker.runOnce();
  assert.equal(calls, 2);
  await worker.stop();
  context.mock.timers.tick(3600000);
  assert.equal(calls, 2);
});
