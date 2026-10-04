-- New owner-scoped tables preserve the legacy demo snapshot and sessions.
CREATE TABLE IF NOT EXISTS app_accounts (
  id TEXT PRIMARY KEY,
  owner_slot INTEGER NOT NULL DEFAULT 1 UNIQUE CHECK (owner_slot = 1),
  username TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  reminders_enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS app_sessions (
  token_hash TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES app_accounts(id) ON DELETE CASCADE,
  csrf_token TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS app_sessions_expiry_idx ON app_sessions(expires_at);
CREATE TABLE IF NOT EXISTS moodle_connections (
  account_id TEXT PRIMARY KEY REFERENCES app_accounts(id) ON DELETE CASCADE,
  nim TEXT NOT NULL,
  credentials_cipher TEXT NOT NULL,
  cookies_cipher TEXT,
  state TEXT NOT NULL DEFAULT 'connected' CHECK (state IN ('connected','needs_login','error')),
  last_error TEXT,
  sync_requested_at TIMESTAMPTZ,
  last_sync_at TIMESTAMPTZ,
  last_archive_sync_at TIMESTAMPTZ,
  generation INTEGER NOT NULL DEFAULT 1,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS semester_course_links (
  account_id TEXT NOT NULL REFERENCES app_accounts(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  selected_course_id TEXT,
  candidates JSONB NOT NULL DEFAULT '[]'::jsonb,
  checked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, code)
);
CREATE TABLE IF NOT EXISTS tracked_courses (
  account_id TEXT NOT NULL REFERENCES app_accounts(id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  source_name TEXT NOT NULL,
  url TEXT NOT NULL,
  sections JSONB NOT NULL DEFAULT '[]'::jsonb,
  checked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, id)
);
CREATE TABLE IF NOT EXISTS tracked_assignments (
  account_id TEXT NOT NULL,
  id TEXT NOT NULL,
  course_id TEXT NOT NULL,
  title TEXT NOT NULL,
  url TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  due_at TIMESTAMPTZ,
  submitted_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'unknown' CHECK (status IN ('pending','overdue','draft','submitted','unknown')),
  grading_status TEXT NOT NULL DEFAULT 'not_graded',
  verified BOOLEAN NOT NULL DEFAULT false,
  checked_at TIMESTAMPTZ,
  last_error TEXT,
  present BOOLEAN NOT NULL DEFAULT true,
  dismissed_at TIMESTAMPTZ,
  dismissal_reason TEXT CHECK (dismissal_reason IS NULL OR dismissal_reason = 'group'),
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, id),
  FOREIGN KEY (account_id, course_id) REFERENCES tracked_courses(account_id,id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS tracked_assignments_due_idx ON tracked_assignments(account_id,due_at);
CREATE TABLE IF NOT EXISTS sync_runs (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES app_accounts(id) ON DELETE CASCADE,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running','success','partial','failed','needs_login','interrupted')),
  courses INTEGER NOT NULL DEFAULT 0,
  assignments INTEGER NOT NULL DEFAULT 0,
  errors INTEGER NOT NULL DEFAULT 0,
  message TEXT
);
CREATE INDEX IF NOT EXISTS sync_runs_account_idx ON sync_runs(account_id,started_at DESC);
CREATE TABLE IF NOT EXISTS job_leases (
  name TEXT PRIMARY KEY,
  holder TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL
);
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES app_accounts(id) ON DELETE CASCADE,
  session_token_hash TEXT,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS notification_deliveries (
  subscription_id TEXT NOT NULL REFERENCES push_subscriptions(id) ON DELETE CASCADE,
  slot TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('sending','sent','failed','uncertain')),
  attempts INTEGER NOT NULL DEFAULT 1,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (subscription_id,slot)
);
