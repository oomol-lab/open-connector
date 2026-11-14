-- In-repo multi-tenancy (OC-1): every row-scoped table gains tenant_id and
-- all existing rows backfill to 'local', keeping single-tenant instances
-- working unchanged. Instance-singleton tables (instance_identity,
-- managed_project, marketplace_config, runtime_policy, oauth_clients,
-- oauth_signing_keys, oauth_sources) deliberately stay tenant-free.

-- connections: gains tenant_id + subject/status/visibility; primary key
-- becomes (tenant_id, service, connection_name).
alter table connections
  add column tenant_id text not null default 'local',
  add column subject text not null default 'local-admin',
  add column status text not null default 'active' check (status in ('active', 'expired', 'revoked', 'failed')),
  add column visibility text not null default 'private' check (visibility in ('private', 'service', 'shared')),
  drop constraint connections_pkey,
  add primary key (tenant_id, service, connection_name);

alter table connection_requests add column tenant_id text not null default 'local';
alter table runtime_tokens add column tenant_id text not null default 'local';
alter table runs add column tenant_id text not null default 'local';
alter table trigger_subscriptions add column tenant_id text not null default 'local';
alter table trigger_source_applications add column tenant_id text not null default 'local';
alter table oauth_states add column tenant_id text not null default 'local';
alter table oauth_authorization_codes add column tenant_id text not null default 'local';
alter table oauth_tokens add column tenant_id text not null default 'local';
alter table saas_cleanup add column tenant_id text not null default 'local';

alter table connection_retirements
  add column tenant_id text not null default 'local',
  drop constraint connection_retirements_pkey,
  add primary key (tenant_id, service, connection_name);

alter table oauth_client_configs
  add column tenant_id text not null default 'local',
  drop constraint oauth_client_configs_pkey,
  add primary key (tenant_id, service);

alter table custom_mcp
  add column tenant_id text not null default 'local',
  drop constraint custom_mcp_pkey,
  add primary key (tenant_id, service);

alter table provider_preferences
  add column tenant_id text not null default 'local',
  drop constraint provider_preferences_pkey,
  add primary key (tenant_id, service);

-- key_hash is caller-controlled input: scope the claim key per tenant.
alter table idempotency_records
  add column tenant_id text not null default 'local',
  drop constraint idempotency_records_pkey,
  add primary key (tenant_id, key_hash);
