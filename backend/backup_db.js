const fs = require('fs');
const path = require('path');

function backupDatabase() {
  const dbPath = path.join(__dirname, 'prisma', 'dev.db');
  const backupDir = path.join(__dirname, 'backups');

  if (!fs.existsSync(dbPath)) {
    console.error(`Database file not found at ${dbPath}`);
    return;
  }

  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupFileName = `spu_loom_erp_backup_${timestamp}.db`;
  const destinationPath = path.join(backupDir, backupFileName);

  try {
    fs.copyFileSync(dbPath, destinationPath);
    console.log(`✅ Database backup created successfully: ${destinationPath}`);

    // Manage backup retention (Keep latest 30 backups)
    const files = fs.readdirSync(backupDir)
      .filter(f => f.startsWith('spu_loom_erp_backup_') && f.endsWith('.db'))
      .map(f => ({ name: f, time: fs.statSync(path.join(backupDir, f)).mtime.getTime() }))
      .sort((a, b) => b.time - a.time);

    if (files.length > 30) {
      const oldFiles = files.slice(30);
      oldFiles.forEach(f => {
        fs.unlinkSync(path.join(backupDir, f.name));
        console.log(`🧹 Cleaned old backup: ${f.name}`);
      });
    }
  } catch (err) {
    console.error('❌ Error creating database backup:', err);
  }
}

if (require.main === module) {
  backupDatabase();
}

module.exports = { backupDatabase };
