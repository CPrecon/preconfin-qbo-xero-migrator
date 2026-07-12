create extension if not exists pgcrypto;

create table if not exists oauth_states (
  nonce text primary key,
  return_to text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table if not exists qbo_connections (
  id uuid primary key default gen_random_uuid(),
  realm_id text not null,
  company_name text,
  encrypted_tokens text not null,
  access_token_hash text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists migration_jobs (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid not null references qbo_connections(id) on delete cascade,
  access_token_hash text not null,
  status text not null check (status in ('queued', 'running', 'completed', 'failed')),
  readiness_score integer check (readiness_score between 0 and 100),
  readiness_status text,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists migration_artifacts (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references migration_jobs(id) on delete cascade,
  kind text not null check (kind in ('zip', 'pdf', 'json')),
  storage_path text not null,
  content_type text not null,
  size_bytes bigint not null,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists migration_leads (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  name text,
  company text,
  migration_job_id uuid references migration_jobs(id) on delete set null,
  source text not null,
  created_at timestamptz not null default now()
);

create table if not exists audit_events (
  id uuid primary key default gen_random_uuid(),
  event text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_oauth_states_expires_at on oauth_states(expires_at);
create index if not exists idx_qbo_connections_realm_id on qbo_connections(realm_id);
create index if not exists idx_migration_jobs_connection_id on migration_jobs(connection_id);
create index if not exists idx_migration_artifacts_job_id on migration_artifacts(job_id);
create index if not exists idx_migration_leads_email on migration_leads(email);
create index if not exists idx_audit_events_event_created_at on audit_events(event, created_at desc);

create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_qbo_connections_updated_at on qbo_connections;
create trigger trg_qbo_connections_updated_at before update on qbo_connections for each row execute function set_updated_at();

drop trigger if exists trg_migration_jobs_updated_at on migration_jobs;
create trigger trg_migration_jobs_updated_at before update on migration_jobs for each row execute function set_updated_at();

alter table oauth_states enable row level security;
alter table qbo_connections enable row level security;
alter table migration_jobs enable row level security;
alter table migration_artifacts enable row level security;
alter table migration_leads enable row level security;
alter table audit_events enable row level security;

-- The API uses the Supabase service role. No anonymous policies are created for sensitive migration data.
