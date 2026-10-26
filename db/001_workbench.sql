-- 工作台业务数据表：用例、工作流和运行环境全部由 PostgreSQL 持久化。
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'qa_engineer',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS environments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  base_url TEXT NOT NULL,
  allowed_hosts TEXT[] NOT NULL DEFAULT '{}',
  workers INTEGER,
  openai_base_url TEXT,
  midscene_model_name TEXT,
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT environments_workers_positive CHECK (workers IS NULL OR workers > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS environments_one_default_idx
  ON environments (created_by) WHERE is_default;

CREATE TABLE IF NOT EXISTS test_cases (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  mode TEXT NOT NULL DEFAULT 'manual',
  prompt TEXT NOT NULL DEFAULT '',
  owner_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE test_cases ADD COLUMN IF NOT EXISTS mode TEXT NOT NULL DEFAULT 'manual';
ALTER TABLE test_cases ADD COLUMN IF NOT EXISTS prompt TEXT NOT NULL DEFAULT '';

CREATE TABLE IF NOT EXISTS test_case_steps (
  id BIGSERIAL PRIMARY KEY,
  case_id TEXT NOT NULL REFERENCES test_cases(id) ON DELETE CASCADE,
  step_order INTEGER NOT NULL,
  action TEXT NOT NULL,
  selector TEXT NOT NULL DEFAULT '',
  value TEXT NOT NULL DEFAULT '',
  UNIQUE (case_id, step_order),
  CONSTRAINT test_case_steps_action_valid CHECK (action IN ('goto', 'click', 'fill', 'assertVisible', 'assertText'))
);

CREATE TABLE IF NOT EXISTS workflows (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  module TEXT NOT NULL,
  owner_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS workflow_cases (
  workflow_id TEXT NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  case_id TEXT NOT NULL REFERENCES test_cases(id) ON DELETE CASCADE,
  step_order INTEGER NOT NULL,
  PRIMARY KEY (workflow_id, case_id),
  UNIQUE (workflow_id, step_order)
);

CREATE INDEX IF NOT EXISTS test_cases_owner_idx ON test_cases (owner_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS workflows_owner_idx ON workflows (owner_id, updated_at DESC);
