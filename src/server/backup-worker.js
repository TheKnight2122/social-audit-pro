import { createBackup, parseBackupKey } from "./backups.js";

export function createBackupWorker({
  database,
  directory = process.env.BACKUP_DIRECTORY || "backups",
  encryptionKey = process.env.BACKUP_ENCRYPTION_KEY,
  intervalHours = Number(process.env.BACKUP_INTERVAL_HOURS || 0),
  backup = createBackup,
  log = (event) => console.log(JSON.stringify(event))
}) {
  if (!Number.isFinite(intervalHours) || intervalHours < 0 || intervalHours > 168 ||
      (intervalHours > 0 && intervalHours < 1)) {
    throw new Error("BACKUP_INTERVAL_HOURS debe ser 0 o un numero entre 1 y 168.");
  }
  if (intervalHours > 0) parseBackupKey(encryptionKey);
  let timer = null;
  let pending = null;
  let stopped = false;

  function runOnce() {
    if (stopped || pending) return pending || Promise.resolve(null);
    pending = Promise.resolve().then(() => backup({ database, directory, encryptionKey }))
      .then((result) => {
        log({ event: "backup.completed", timestamp: new Date().toISOString(), bytes: result.bytes });
        return result;
      }).catch(() => {
        log({ event: "backup.failed", timestamp: new Date().toISOString() });
        return null;
      }).finally(() => { pending = null; });
    return pending;
  }

  function start() {
    if (timer || intervalHours === 0) return;
    stopped = false;
    timer = setInterval(runOnce, intervalHours * 3600000);
    timer.unref?.();
    runOnce();
  }

  function stop() {
    stopped = true;
    if (timer) clearInterval(timer);
    timer = null;
    return pending || Promise.resolve();
  }

  return { start, stop, runOnce };
}
