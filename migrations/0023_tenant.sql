-- In-repo multi-tenancy (OC-1): every row-scoped table gains tenant_id and
-- all existing rows backfill to 'local', keeping single-tenant dev instances
-- working unchanged. Instance-singleton tables (instance_identity,
-- managed_project, marketplace_config, runtime_policy, oauth_clients,
-- oauth_signing_keys, oauth_sources) deliberately stay tenant-free.

-- connections: primary key becomes (tenant_id, service, connection_name) and
-- gains subject (owner identity: user:/space:/service:), status, visibility.
create table connections_next (
  id text not null unique,
  tenant_id text not null default 'local',
  subject text not null default 'local-admin',
  status text not null default 'active' check (status in ('active', 'expired', 'revoked', 'failed')),
  visibility text not null default 'private' check (visibility in ('private', 'service', 'shared')),
  service text not null,
  connection_name text not null,
  value text not null,
  updated_at text not null,
  revision text not null default '',
  source text not null default 'local' check (source in ('local', 'saas')),
  managed_project_id text,
  provider_config_id text,
  external_user_id text,
  remote_account_id text,
  local_request_id text,
  provider_account_id text,
  primary key (tenant_id, service, connection_name)
);

insert into connections_next (
  id, service, connection_name, value, updated_at, revision, source,
  managed_project_id, provider_config_id, external_user_id,
  remote_account_id, local_request_id, provider_account_id
)
select
  id, service, connection_name, value, updated_at, revision, source,
  managed_project_id, provider_config_id, external_user_id,
  remote_account_id, local_request_id, provider_account_id
from connections;

drop table connections;
alter table connections_next rename to connections;
create index connections_managed_project on connections (managed_project_id);

-- Remaining tenant columns are plain additions on top of the 'local' default.
alter table connection_requests add column tenant_id text not null default 'local';
alter table runtime_tokens add column tenant_id text not null default 'local';
alter table runs add column tenant_id text not null default 'local';
alter table trigger_subscriptions add column tenant_id text not null default 'local';
alter table trigger_source_applications add column tenant_id text not null default 'local';
alter table oauth_states add column tenant_id text not null default 'local';
alter table oauth_authorization_codes add column tenant_id text not null default 'local';
alter table oauth_tokens add column tenant_id text not null default 'local';
alter table saas_cleanup add column tenant_id text not null default 'local';

-- connection_retirements: primary key becomes (tenant_id, service, connection_name).
create table connection_retirements_next (
  tenant_id text not null default 'local',
  service text not null,
  connection_name text not null,
  generation text not null,
  primary key (tenant_id, service, connection_name)
);
insert into connection_retirements_next (service, connection_name, generation)
select service, connection_name, generation from connection_retirements;
drop table connection_retirements;
alter table connection_retirements_next rename to connection_retirements;

-- oauth_client_configs: org-level auth config — primary key becomes (tenant_id, service).
create table oauth_client_configs_next (
  tenant_id text not null default 'local',
  service text not null,
  value text not null,
  updated_at text not null,
  primary key (tenant_id, service)
);
insert into oauth_client_configs_next (service, value, updated_at)
select service, value, updated_at from oauth_client_configs;
drop table oauth_client_configs;
alter table oauth_client_configs_next rename to oauth_client_configs;

-- custom_mcp: primary key becomes (tenant_id, service); name_key stays globally unique.
create table custom_mcp_next (
  tenant_id text not null default 'local',
  service text not null,
  name_key text not null unique,
  display_name text not null,
  endpoint text not null,
  transport text not null,
  auth_json text not null,
  enabled integer not null,
  actions_json text not null,
  sync_connection_id text,
  last_synced_at text,
  sync_error text,
  revision text not null,
  primary key (tenant_id, service)
);
insert into custom_mcp_next (
  service, name_key, display_name, endpoint, transport, auth_json, enabled,
  actions_json, sync_connection_id, last_synced_at, sync_error, revision
)
select
  service, name_key, display_name, endpoint, transport, auth_json, enabled,
  actions_json, sync_connection_id, last_synced_at, sync_error, revision
from custom_mcp;
drop table custom_mcp;
alter table custom_mcp_next rename to custom_mcp;

-- provider_preferences: primary key becomes (tenant_id, service).
create table provider_preferences_next (
  tenant_id text not null default 'local',
  service text not null,
  enabled integer not null check (enabled in (0, 1)),
  created_at text not null,
  updated_at text not null,
  primary key (tenant_id, service)
);
insert into provider_preferences_next (service, enabled, created_at, updated_at)
select service, enabled, created_at, updated_at from provider_preferences;
drop table provider_preferences;
alter table provider_preferences_next rename to provider_preferences;

-- idempotency_records: key_hash is caller-controlled input, so the primary key
-- becomes (tenant_id, key_hash). A global key would let one tenant squat on or
-- replay another tenant's idempotency keys.
create table idempotency_records_next (
  tenant_id text not null default 'local',
  key_hash text not null,
  claim_id text not null,
  request_hash text not null,
  state text not null check (state in ('in_progress', 'completed')),
  response_value text,
  created_at text not null,
  expires_at text not null,
  check (
    (state = 'in_progress' and response_value is null)
    or (state = 'completed' and response_value is not null)
  ),
  primary key (tenant_id, key_hash)
);
insert into idempotency_records_next (
  key_hash, claim_id, request_hash, state, response_value, created_at, expires_at
)
select key_hash, claim_id, request_hash, state, response_value, created_at, expires_at
from idempotency_records;
drop table idempotency_records;
alter table idempotency_records_next rename to idempotency_records;
create index idempotency_records_expires_at_idx on idempotency_records (expires_at);
