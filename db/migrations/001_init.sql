-- Clockinator canonical schema (SQLite 3).
-- Money: TEXT decimal strings (e.g. '160.00') to avoid binary float.
-- Timestamps: ISO-8601 UTC (e.g. '2026-08-16T14:02:00.000Z').
-- Booleans: INTEGER 0/1.

CREATE TABLE workspaces (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  default_billable_rate TEXT NOT NULL DEFAULT '0',
  default_cost_rate TEXT NOT NULL DEFAULT '0',
  currency TEXT NOT NULL DEFAULT 'USD',
  timezone TEXT NOT NULL DEFAULT 'UTC',
  created_at TEXT NOT NULL
);

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  default_cost_rate TEXT NOT NULL DEFAULT '0',
  role TEXT NOT NULL DEFAULT 'owner' CHECK (role IN ('owner', 'manager', 'member')),
  created_at TEXT NOT NULL,
  UNIQUE (workspace_id, email)
);

CREATE TABLE clients (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  name TEXT NOT NULL,
  archived INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  UNIQUE (workspace_id, name)
);

CREATE TABLE projects (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  client_id TEXT REFERENCES clients(id),
  name TEXT NOT NULL,
  color TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'on_hold', 'archived')),
  access TEXT NOT NULL DEFAULT 'public' CHECK (access IN ('public', 'private')),
  is_billable INTEGER NOT NULL DEFAULT 1,
  is_favorite INTEGER NOT NULL DEFAULT 0,
  billable_rate TEXT,
  estimated_hours TEXT,
  created_at TEXT NOT NULL,
  UNIQUE (workspace_id, name)
);

CREATE TABLE tasks (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  project_id TEXT NOT NULL REFERENCES projects(id),
  name TEXT NOT NULL,
  billable_rate TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'done', 'archived')),
  created_at TEXT NOT NULL,
  UNIQUE (project_id, name)
);

CREATE TABLE tags (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  name TEXT NOT NULL,
  color TEXT,
  created_at TEXT NOT NULL,
  UNIQUE (workspace_id, name)
);

-- Historic rates: close the previous open row (effective_to) before inserting a new one.
-- subject_type workspace uses subject_id = workspaces.id.
CREATE TABLE rate_history (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  subject_type TEXT NOT NULL CHECK (subject_type IN ('workspace', 'project', 'task', 'user')),
  subject_id TEXT NOT NULL,
  rate_kind TEXT NOT NULL CHECK (rate_kind IN ('billable', 'cost')),
  amount TEXT NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  effective_from TEXT NOT NULL,
  effective_to TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX idx_rate_history_lookup
  ON rate_history (subject_type, subject_id, rate_kind, effective_from);

-- One logical timer per user (running / paused / on_break). Stopped sessions remain for history.
CREATE TABLE timer_sessions (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  status TEXT NOT NULL CHECK (status IN ('running', 'paused', 'on_break', 'stopped')),
  description TEXT NOT NULL DEFAULT '',
  project_id TEXT REFERENCES projects(id),
  task_id TEXT REFERENCES tasks(id),
  is_billable INTEGER NOT NULL DEFAULT 0,
  billable_rate_snapshot TEXT NOT NULL DEFAULT '0',
  cost_rate_snapshot TEXT NOT NULL DEFAULT '0',
  timezone TEXT NOT NULL DEFAULT 'UTC',
  started_at TEXT NOT NULL,
  stopped_at TEXT,
  created_at TEXT NOT NULL
);

CREATE UNIQUE INDEX idx_one_open_session
  ON timer_sessions (workspace_id, user_id)
  WHERE status IN ('running', 'paused', 'on_break');

CREATE TABLE time_entries (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  created_by_user_id TEXT NOT NULL REFERENCES users(id),
  session_id TEXT REFERENCES timer_sessions(id),
  parent_entry_id TEXT REFERENCES time_entries(id),
  project_id TEXT REFERENCES projects(id),
  task_id TEXT REFERENCES tasks(id),
  kind TEXT NOT NULL DEFAULT 'work' CHECK (kind IN ('work', 'break')),
  source TEXT NOT NULL DEFAULT 'timer' CHECK (source IN ('timer', 'web', 'api', 'import', 'manager_manual', 'split')),
  description TEXT NOT NULL DEFAULT '',
  start_at TEXT NOT NULL,
  end_at TEXT,
  duration_seconds INTEGER NOT NULL DEFAULT 0,
  is_billable INTEGER NOT NULL DEFAULT 0,
  billable_rate_snapshot TEXT NOT NULL DEFAULT '0',
  cost_rate_snapshot TEXT NOT NULL DEFAULT '0',
  approval_status TEXT NOT NULL DEFAULT 'draft'
    CHECK (approval_status IN ('draft', 'submitted', 'approved', 'rejected', 'locked')),
  timezone TEXT NOT NULL DEFAULT 'UTC',
  deleted_at TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX idx_entries_workspace_start ON time_entries (workspace_id, start_at);
CREATE INDEX idx_entries_user_start ON time_entries (user_id, start_at);
CREATE INDEX idx_entries_project ON time_entries (project_id);
CREATE INDEX idx_entries_session ON time_entries (session_id);
CREATE INDEX idx_entries_running ON time_entries (workspace_id, user_id) WHERE end_at IS NULL AND deleted_at IS NULL;

CREATE TABLE time_entry_tags (
  time_entry_id TEXT NOT NULL REFERENCES time_entries(id) ON DELETE CASCADE,
  tag_id TEXT NOT NULL REFERENCES tags(id),
  PRIMARY KEY (time_entry_id, tag_id)
);

CREATE TABLE invoices (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  client_id TEXT NOT NULL REFERENCES clients(id),
  number TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'paid', 'void')),
  issue_date TEXT NOT NULL,
  due_date TEXT,
  currency TEXT NOT NULL DEFAULT 'USD',
  notes TEXT,
  created_at TEXT NOT NULL,
  UNIQUE (workspace_id, number)
);

CREATE TABLE invoice_lines (
  id TEXT PRIMARY KEY,
  invoice_id TEXT NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  time_entry_id TEXT REFERENCES time_entries(id),
  description TEXT NOT NULL,
  quantity_hours TEXT NOT NULL,
  rate TEXT NOT NULL,
  amount TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX idx_invoice_lines_invoice ON invoice_lines (invoice_id);

CREATE TABLE custom_field_definitions (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  target TEXT NOT NULL CHECK (target IN ('workspace', 'user', 'client', 'project', 'task', 'time_entry', 'invoice')),
  name TEXT NOT NULL,
  field_type TEXT NOT NULL CHECK (field_type IN ('text', 'number', 'boolean', 'date', 'select')),
  required INTEGER NOT NULL DEFAULT 0,
  options_json TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  UNIQUE (workspace_id, target, name)
);

CREATE TABLE custom_field_values (
  id TEXT PRIMARY KEY,
  field_id TEXT NOT NULL REFERENCES custom_field_definitions(id) ON DELETE CASCADE,
  target_id TEXT NOT NULL,
  value_json TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (field_id, target_id)
);

CREATE TABLE audit_logs (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  actor_user_id TEXT NOT NULL REFERENCES users(id),
  action TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  reason TEXT,
  metadata_json TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX idx_audit_workspace_created ON audit_logs (workspace_id, created_at);
