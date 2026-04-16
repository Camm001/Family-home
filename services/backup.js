const cron = require('node-cron');
const fs = require('fs');
const path = require('path');

// Nightly at 2am
cron.schedule('0 2 * * *', () => {
  runBackup();
});

function runBackup() {
  const backupPath = process.env.BACKUP_PATH || path.join(__dirname, '..', 'backups');
  fs.mkdirSync(backupPath, { recursive: true });

  const date = new Date().toISOString().split('T')[0];
  const dbSrc = path.join(__dirname, '..', 'family-hub.db');
  const dbDest = path.join(backupPath, `family-hub-${date}.db`);

  try {
    fs.copyFileSync(dbSrc, dbDest);
    console.log(`[Backup] DB backed up to ${dbDest}`);
  } catch (e) {
    console.error('[Backup] DB backup failed:', e.message);
  }

  // Copy photos dir
  const photosSrc = path.join(__dirname, '..', 'data', 'photos');
  const photosDest = path.join(backupPath, 'photos');
  try {
    copyDir(photosSrc, photosDest);
    console.log(`[Backup] Photos backed up to ${photosDest}`);
  } catch (e) {
    console.error('[Backup] Photos backup failed:', e.message);
  }

  // Prune backups older than 30 days
  try {
    const files = fs.readdirSync(backupPath).filter(f => f.startsWith('family-hub-') && f.endsWith('.db'));
    const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
    for (const f of files) {
      const fPath = path.join(backupPath, f);
      if (fs.statSync(fPath).mtimeMs < cutoff) {
        fs.unlinkSync(fPath);
        console.log(`[Backup] Pruned old backup: ${f}`);
      }
    }
  } catch {}
}

function copyDir(src, dest) {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

module.exports = { runBackup };
