-- 004 - Job title on login accounts. Additive only: nothing existing is changed.
ALTER TABLE users ADD COLUMN IF NOT EXISTS job_title TEXT;
