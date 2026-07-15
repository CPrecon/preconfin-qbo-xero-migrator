alter table migration_leads
  add column if not exists admin_email_status text not null default 'pending'
    check (admin_email_status in ('pending', 'sent', 'failed')),
  add column if not exists admin_email_attempted_at timestamptz,
  add column if not exists admin_email_provider_message_id text,
  add column if not exists admin_email_failure_code text,
  add column if not exists confirmation_email_status text not null default 'pending'
    check (confirmation_email_status in ('pending', 'sent', 'failed')),
  add column if not exists confirmation_email_attempted_at timestamptz,
  add column if not exists confirmation_email_provider_message_id text,
  add column if not exists confirmation_email_failure_code text;

create index if not exists idx_migration_leads_delivery_status
  on migration_leads(admin_email_status, confirmation_email_status, created_at);

-- Existing RLS remains in force. Only the service-role API can insert or update leads.
