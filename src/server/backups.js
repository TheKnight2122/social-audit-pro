import Database from "better-sqlite3";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { createReadStream, createWriteStream, constants } from "node:fs";
import { chmod, copyFile, lstat, mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { pipeline } from "node:stream/promises";

const migrationsDirectory = new URL("../../migrations/", import.meta.url);

function authenticatedMetadata({ format, version, createdAt, migrations }) {
  return Buffer.from(JSON.stringify({ format, version, createdAt, migrations }));
}

export function parseBackupKey(value) {
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/i.test(value)) {
    throw new Error("BACKUP_ENCRYPTION_KEY debe contener 64 caracteres hexadecimales aleatorios.");
  }
  return Buffer.from(value, "hex");
}

async function sha256(path) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest("hex");
}

async function inspectDatabase(path) {
  const database = new Database(path, { readonly: true, fileMustExist: true });
  try {
    database.pragma("trusted_schema = OFF");
    const checks = database.pragma("integrity_check");
    if (checks.length !== 1 || checks[0].integrity_check !== "ok") {
      throw new Error("La base no supera la comprobacion de integridad.");
    }
    if (database.pragma("foreign_key_check").length) {
      throw new Error("La base contiene referencias invalidas.");
    }
    const migrations = database.prepare("SELECT name FROM schema_migrations ORDER BY name").all().map((row) => row.name);
    const supported = (await readdir(migrationsDirectory)).filter((name) => name.endsWith(".sql")).sort();
    if (!migrations.includes("006-multi-provider-oauth.sql") ||
        migrations.some((name, index) => name !== supported[index])) {
      throw new Error("El esquema de esta copia no es compatible con esta version.");
    }
    return migrations;
  } finally {
    database.close();
  }
}

async function readManifest(directory) {
  const manifestPath = join(directory, "manifest.json");
  const metadata = await lstat(manifestPath);
  if (!metadata.isFile() || metadata.size > 16384) throw new Error("Manifiesto de copia invalido.");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  if (manifest.format !== "social-audit-pro-backup" || manifest.version !== 1 ||
      manifest.cipher !== "aes-256-gcm" || !/^[a-f0-9]{24}$/.test(manifest.iv) ||
      !/^[a-f0-9]{32}$/.test(manifest.tag) || !/^[a-f0-9]{64}$/.test(manifest.sha256) ||
      !Number.isSafeInteger(manifest.bytes) || manifest.bytes <= 0 ||
      typeof manifest.createdAt !== "string" || !Number.isFinite(Date.parse(manifest.createdAt)) ||
      !Array.isArray(manifest.migrations) || manifest.migrations.some((name) => typeof name !== "string")) {
    throw new Error("Formato o contenido del manifiesto no admitido.");
  }
  return manifest;
}

async function decryptSnapshot(directory, outputPath, key) {
  const manifest = await readManifest(directory);
  const encryptedPath = join(directory, "database.enc");
  const metadata = await lstat(encryptedPath);
  if (!metadata.isFile() || metadata.size !== manifest.bytes) throw new Error("La copia esta incompleta.");
  const hash = createHash("sha256");
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(manifest.iv, "hex"));
  decipher.setAAD(authenticatedMetadata(manifest));
  decipher.setAuthTag(Buffer.from(manifest.tag, "hex"));
  const input = createReadStream(encryptedPath);
  input.on("data", (chunk) => hash.update(chunk));
  try {
    await pipeline(input, decipher, createWriteStream(outputPath, { flags: "wx", mode: 0o600 }));
  } catch {
    throw new Error("No se pudo autenticar la copia: clave incorrecta o archivo alterado.");
  }
  if (hash.digest("hex") !== manifest.sha256) throw new Error("La suma SHA-256 no coincide.");
  const migrations = await inspectDatabase(outputPath);
  if (JSON.stringify(migrations) !== JSON.stringify(manifest.migrations)) {
    throw new Error("El esquema no coincide con el manifiesto.");
  }
  return manifest;
}

export async function createBackup({ database, directory, encryptionKey }) {
  const key = parseBackupKey(encryptionKey);
  const root = resolve(directory);
  await mkdir(root, { recursive: true, mode: 0o700 });
  const createdAt = new Date().toISOString();
  const bundle = await mkdtemp(join(root, "sap-" + createdAt.replace(/[:.]/g, "-") + "-"));
  await chmod(bundle, 0o700);
  const staging = await mkdtemp(join(bundle, ".snapshot-"));
  await chmod(staging, 0o700);
  const snapshotPath = join(staging, "database.sqlite");
  try {
    // SQLite's online backup includes committed WAL pages without copying a live file.
    await writeFile(snapshotPath, "", { flag: "wx", mode: 0o600 });
    await database.backup(snapshotPath);
    const snapshot = new Database(snapshotPath, { fileMustExist: true });
    try { snapshot.pragma("journal_mode = DELETE"); } finally { snapshot.close(); }
    const migrations = await inspectDatabase(snapshotPath);
    const encryptedPath = join(bundle, "database.enc");
    const metadata = { format: "social-audit-pro-backup", version: 1, createdAt, migrations };
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", key, iv);
    cipher.setAAD(authenticatedMetadata(metadata));
    await pipeline(createReadStream(snapshotPath), cipher,
      createWriteStream(encryptedPath, { flags: "wx", mode: 0o600 }));
    const manifest = {
      ...metadata,
      cipher: "aes-256-gcm", iv: iv.toString("hex"), tag: cipher.getAuthTag().toString("hex"),
      bytes: (await stat(encryptedPath)).size, sha256: await sha256(encryptedPath)
    };
    await writeFile(join(bundle, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n", { flag: "wx", mode: 0o600 });
    await decryptSnapshot(bundle, join(staging, "verification.sqlite"), key);
    return { directory: bundle, createdAt, bytes: manifest.bytes, verified: true };
  } catch (error) {
    await rm(join(bundle, "manifest.json"), { force: true });
    throw error;
  } finally {
    // Only remove the private staging directory allocated by this operation.
    await rm(staging, { recursive: true, force: true });
  }
}

async function withSnapshot({ directory, encryptionKey, temporaryDirectory }, callback) {
  const key = parseBackupKey(encryptionKey);
  const tempRoot = resolve(temporaryDirectory || "data/backup-verification");
  await mkdir(tempRoot, { recursive: true, mode: 0o700 });
  const staging = await mkdtemp(join(tempRoot, ".restore-"));
  await chmod(staging, 0o700);
  const snapshotPath = join(staging, "database.sqlite");
  try {
    const manifest = await decryptSnapshot(resolve(directory), snapshotPath, key);
    return await callback(snapshotPath, manifest);
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
}

export async function verifyBackup(options) {
  return withSnapshot(options, (_path, manifest) => ({
    verified: true, createdAt: manifest.createdAt, bytes: manifest.bytes, migrations: manifest.migrations
  }));
}

export async function restoreBackup({ target, ...options }) {
  if (!target || target === ":memory:") throw new Error("Indica un archivo de destino nuevo.");
  const destination = resolve(target);
  for (const path of [destination, destination + "-wal", destination + "-shm", destination + "-journal"]) {
    try {
      await lstat(path);
      throw new Error("El destino o sus archivos auxiliares ya existen. Usa una ruta nueva.");
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
  return withSnapshot(options, async (snapshotPath, manifest) => {
    const database = new Database(snapshotPath, { fileMustExist: true });
    try {
      database.pragma("trusted_schema = OFF");
      database.pragma("foreign_keys = ON");
      database.transaction(() => {
        database.exec(`
          DELETE FROM sessions;
          DELETE FROM auth_tokens;
          DELETE FROM oauth_states;
          UPDATE users SET mfa_pending_secret_encrypted = NULL, mfa_recovery_codes_json = '[]';
          UPDATE sync_schedules SET enabled = 0, lease_owner = NULL, lease_expires_at = NULL,
            updated_at = CURRENT_TIMESTAMP;
          UPDATE oauth_sync_runs SET status = 'failed', completed_at = CURRENT_TIMESTAMP,
            error_message = 'Interrumpida por restauracion' WHERE status = 'running';
        `);
        database.prepare("INSERT INTO activity_logs (action, entity_type, metadata_json) VALUES (?, ?, ?)")
          .run("system.backup_restored", "database", JSON.stringify({ backupCreatedAt: manifest.createdAt }));
      })();
    } finally {
      database.close();
    }
    await inspectDatabase(snapshotPath);
    await mkdir(dirname(destination), { recursive: true, mode: 0o700 });
    await copyFile(snapshotPath, destination, constants.COPYFILE_EXCL);
    return { restored: true, target: destination, backupCreatedAt: manifest.createdAt, schedulesPaused: true };
  });
}
