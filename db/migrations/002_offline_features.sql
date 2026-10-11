-- Local-first features that do not need a cloud account, mail server, or kiosk hardware.
-- Existing rows pick up column defaults. New tables are empty until the app writes them.

ALTER TABLE workspaces ADD COLUMN rounding_minutes INTEGER NOT NULL DEFAULT 0;
ALTER TABLE workspaces ADD COLUMN rounding_mode TEXT NOT NULL DEFAULT 'nearest';
ALTER TABLE workspaces ADD COLUMN require_description INTEGER NOT NULL DEFAULT 0;
ALTER TABLE workspaces ADD COLUMN require_project INTEGER NOT NULL DEFAULT 0;
ALTER TABLE workspaces ADD COLUMN require_task INTEGER NOT NULL DEFAULT 0;
ALTER TABLE workspaces ADD COLUMN require_tag INTEGER NOT NULL DEFAULT 0;
ALTER TABLE workspaces ADD COLUMN weekly_target_seconds INTEGER NOT NULL DEFAULT 144000;
ALTER TABLE workspaces ADD COLUMN force_timer INTEGER NOT NULL DEFAULT 0;
ALTER TABLE workspaces ADD COLUMN hide_member_pages TEXT NOT NULL DEFAULT '';
ALTER TABLE workspaces ADD COLUMN hide_others_time INTEGER NOT NULL DEFAULT 1;
ALTER TABLE workspaces ADD COLUMN hide_rates INTEGER NOT NULL DEFAULT 0;

ALTER TABLE projects ADD COLUMN budget_amount TEXT;
ALTER TABLE clients ADD COLUMN currency TEXT NOT NULL DEFAULT 'USD';

CREATE TABLE favorite_entries (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  description TEXT NOT NULL DEFAULT '',
  project_id TEXT REFERENCES projects(id),
  task_id TEXT REFERENCES tasks(id),
  is_billable INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);

CREATE TABLE favorite_entry_tags (
  favorite_id TEXT NOT NULL REFERENCES favorite_entries(id) ON DELETE CASCADE,
  tag_id TEXT NOT NULL REFERENCES tags(id),
  PRIMARY KEY (favorite_id, tag_id)
);

CREATE TABLE project_templates (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  name TEXT NOT NULL,
  color TEXT,
  is_billable INTEGER NOT NULL DEFAULT 1,
  billable_rate TEXT,
  estimated_hours TEXT,
  budget_amount TEXT,
  created_at TEXT NOT NULL,
  UNIQUE (workspace_id, name)
);

CREATE TABLE project_template_tasks (
  id TEXT PRIMARY KEY,
  template_id TEXT NOT NULL REFERENCES project_templates(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  billable_rate TEXT
);

CREATE TABLE time_off (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  policy TEXT NOT NULL CHECK (policy IN ('vacation', 'sick', 'personal')),
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  hours_per_day TEXT NOT NULL DEFAULT '8',
  status TEXT NOT NULL DEFAULT 'requested' CHECK (status IN ('requested', 'approved', 'rejected')),
  note TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX idx_time_off_user ON time_off (workspace_id, user_id, start_date);

CREATE TABLE expenses (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  project_id TEXT REFERENCES projects(id),
  client_id TEXT REFERENCES clients(id),
  category TEXT NOT NULL,
  amount TEXT NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  spent_on TEXT NOT NULL,
  note TEXT,
  is_billable INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE INDEX idx_expenses_spent ON expenses (workspace_id, spent_on);

CREATE TABLE currency_rates (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  currency TEXT NOT NULL,
  rate_to_base TEXT NOT NULL,
  UNIQUE (workspace_id, currency)
);

CREATE TABLE recurring_invoices (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  client_id TEXT NOT NULL REFERENCES clients(id),
  interval_unit TEXT NOT NULL CHECK (interval_unit IN ('weekly', 'monthly')),
  next_issue_date TEXT NOT NULL,
  notes TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);

CREATE TABLE schedule_blocks (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  project_id TEXT NOT NULL REFERENCES projects(id),
  day TEXT NOT NULL,
  hours TEXT NOT NULL,
  note TEXT,
  created_at TEXT NOT NULL,
  UNIQUE (workspace_id, user_id, project_id, day)
);

CREATE TABLE approval_notes (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  time_entry_id TEXT NOT NULL REFERENCES time_entries(id),
  author_user_id TEXT NOT NULL REFERENCES users(id),
  body TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX idx_approval_notes_entry ON approval_notes (time_entry_id, created_at);
