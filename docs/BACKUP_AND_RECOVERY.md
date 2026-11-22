# Backup and recovery (before any upgrade)

The upgrade (`npm run db:init`) only **adds** tables and columns and runs each migration once in a transaction; if one fails it is rolled back. A backup is still mandatory.

## Windows PowerShell

```powershell
# 1. Backup (adjust the PostgreSQL version folder, user and database name)
$env:PGPASSWORD = Read-Host "Database password"
$stamp = Get-Date -Format "yyyyMMdd-HHmm"
& "C:\Program Files\PostgreSQL\16\bin\pg_dump.exe" -h localhost -U postgres -Fc -f "C:\hrms-backups\hrms-$stamp.dump" hrms
# also copy the uploaded documents folder (UPLOAD_DIR in .env)

# 2. Upgrade
cd C:\path\to\hrms\backend
npm install
npm run db:init

# 3. Recovery (only if needed): restore into a NEW database, check it, then switch
& "C:\Program Files\PostgreSQL\16\bin\createdb.exe" -h localhost -U postgres hrms_restored
& "C:\Program Files\PostgreSQL\16\bin\pg_restore.exe" -h localhost -U postgres -d hrms_restored "C:\hrms-backups\hrms-$stamp.dump"
```
Point `DB_NAME` in `.env` at `hrms_restored` to use the restored copy.

## Undoing a register import
`node src/import-register.js --rollback <batchId>` (batch ids are in `import_batches`). Employees that already have other records are kept and reported.

## Undoing the schema upgrade
The new tables are independent of the old ones, so older code keeps working with the upgraded database. To go back completely, restore the backup.
