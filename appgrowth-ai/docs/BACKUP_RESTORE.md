# Backup and restore

`scripts/backup.sh` — `pg_dump` (custom format) of the `appgrowth` database and a tarball of the file-storage volume, both
encrypted with AES-256 (`openssl enc -pbkdf2`, passphrase in `/opt/appgrowth/secrets/backup.pass`), SHA-256 checksums,
14-day retention on the server. Schedule daily on the server, e.g. `15 1 * * * cd /opt/appgrowth && …` via a cron entry
that runs the same commands, and copy `backups/` off-site (another host or object storage you control).

`scripts/restore.sh <STAMP> [--files] [--target-db name]` — verifies checksums, restores into a **separate** database
(`appgrowth_restore` by default) so production is untouched; point `DATABASE_URL` at it to promote. `--files` restores
uploads into the live volume.

**Restore test** (do monthly and after schema changes): run backup → restore into `appgrowth_restore` → the script prints the
organization count → compare with production → drop the restore database. Record the date in the operations log.
