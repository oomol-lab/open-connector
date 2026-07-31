-- Postgres runtime schema.
--
-- This is a single consolidated schema rather than a port of the SQLite migration
-- history, and deliberately so: there are no existing Postgres deployments, so there is
-- no history to replay. Several of the SQLite migrations are one-time data rewrites that
-- could never apply here anyway — 0006 backfills connection ids using `randomblob`/`hex`
-- and rewrites `runs.value` with `json_set`, and 0011 rebuilds the connections table
-- because SQLite cannot alter a primary key in place. Replaying those against an empty
-- database would be work with no effect and several dialect traps.
--
-- What this file must guarantee is that the END STATE matches SQLite's after every
-- migration, because both back the same store implementations. That equivalence is
-- asserted by the shared conformance test, not by inspection.
--
-- Future changes: add `0002_*.sql` etc. here alongside the SQLite migration, so both
-- dialects stay in step.

create table if not exists connections (
  id text not null unique,
  tenant text not null,
  service text not null,
  connection_name text not null,
  value text not null,
  updated_at text not null,
  revision text not null default '',
  primary key (tenant, service, connection_name)
);

create table if not exists oauth_client_configs (
  service text primary key,
  value text not null,
  updated_at text not null
);

create table if not exists oauth_states (
  state text primary key,
  value text not null,
  created_at text not null
);

create table if not exists runtime_tokens (
  id text primary key,
  name text not null,
  token_hash text not null unique,
  created_at text not null,
  last_used_at text,
  revoked_at text,
  allowed_actions text not null default '[]',
  blocked_actions text not null default '[]',
  allowed_proxies text not null default '[]',
  tenant text not null default 'default'
);

create table if not exists runtime_policy (
  id integer primary key check (id = 1),
  value text not null,
  updated_at text not null
);

-- `ok` stays an integer rather than a boolean: the stores write `run.ok ? 1 : 0` and
-- filter with `ok = ?`, and the column is never read back into the domain model (only
-- `service` and the `value` JSON blob are). Keeping the SQLite representation means one
-- code path serves both dialects.
create table if not exists runs (
  id text primary key,
  service text,
  action_id text not null,
  caller text,
  started_at text not null,
  completed_at text not null,
  ok integer not null,
  value text not null
);

create index if not exists runs_started_at_id_idx on runs (started_at desc, id desc);
create index if not exists runs_action_id_started_at_id_idx on runs (action_id, started_at desc, id desc);
create index if not exists runs_service_started_at_id_idx on runs (service, started_at desc, id desc);
create index if not exists runs_caller_started_at_id_idx on runs (caller, started_at desc, id desc);
create index if not exists runs_ok_started_at_id_idx on runs (ok, started_at desc, id desc);

create table if not exists idempotency_records (
  key_hash text primary key,
  claim_id text not null,
  request_hash text not null,
  state text not null check (state in ('in_progress', 'completed')),
  response_value text,
  created_at text not null,
  expires_at text not null,
  check (
    (state = 'in_progress' and response_value is null)
    or (state = 'completed' and response_value is not null)
  )
);

create index if not exists idempotency_records_expires_at_idx on idempotency_records (expires_at);
