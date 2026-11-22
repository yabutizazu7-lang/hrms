> Update: the register now fills all 27 columns as real employee fields (migration 008) and can also be imported from the screen *Employee register import*. The mapping, rules and results are in `docs/REGISTER_FIELD_MAPPING.md`.

# Importing the 205-employee register (Nehase 2018) - procedure

All commands run in `backend/`. Nothing below deletes data; the apply step is ONE database transaction (all rows or none) and is reversible per batch.

1. **Back up** (database + uploads):  `pg_dump -U postgres -Fc hrms > hrms_before_register_import.dump`  (copy the `UPLOAD_DIR` folder too)
2. `npm install` then `npm run db:init`   (makes sure `import_batches`, `import_rows`, `verification_flags` and the Fayda columns exist)
3. **Preview (writes nothing):**  `node src/import-register.js --file "<register.xlsx>" --with-salary --report preview.csv`
   Expected on a database that has none of these employees: `source_rows 205, insert 205, update 0, skip 0, fail 0`.
4. **Apply:**  `node src/import-register.js --file "<register.xlsx>" --with-salary --create-org --apply`
   `--create-org` creates the 9 departments and 51 job-title/grade positions that do not exist yet (no salary range is invented). Leave it out to link only departments/positions that already exist by name.
5. **Verify (read-only):**  `node src/verify-register.js --file "<register.xlsx>" --with-salary`
6. Undo if needed:  `node src/import-register.js --rollback <batchId>`

Dates: the register is Ethiopian. 96 hire dates and 86 birth dates are spreadsheet serials that are Ethiopian dates whose day and month Excel swapped; they are decoded accordingly (see the comment above `parseDate`). Every converted/repaired date, repeated Fayda or pension number, and every date that could not be read is written to HR's verification flags; unreadable values are left empty, never guessed.
