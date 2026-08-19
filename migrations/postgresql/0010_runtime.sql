create table connections (
  id text not null unique,
  revision text not null,
  service text not null,
  connection_name text not null,
  value text not null,
  updated_at text not null,
  primary key (service, connection_name)
);

create table oauth_client_configs (
  service text primary key,
  value text not null,
  updated_at text not null
);

create table oauth_states (
  state text primary key,
  value text not null,
  created_at text not null
);

create table runtime_tokens (
  id text primary key,
  name text not null,
  token_hash text not null unique,
  allowed_actions text not null default '[]',
  blocked_actions text not null default '[]',
  allowed_proxies text not null default '[]',
  created_at text not null,
  last_used_at text,
  revoked_at text
);

create table runtime_policy (
  id integer primary key check (id = 1),
  value text not null,
  updated_at text not null
);

create table runs (
  id text primary key,
  service text not null,
  action_id text not null,
  caller text not null,
  started_at text not null,
  completed_at text not null,
  ok integer not null check (ok in (0, 1)),
  value text not null
);

create index runs_started_at_id_idx on runs (started_at desc, id desc);
create index runs_service_started_at_id_idx on runs (service, started_at desc, id desc);
create index runs_action_id_started_at_id_idx on runs (action_id, started_at desc, id desc);
create index runs_caller_started_at_id_idx on runs (caller, started_at desc, id desc);
create index runs_ok_started_at_id_idx on runs (ok, started_at desc, id desc);

create table idempotency_records (
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

create index idempotency_records_expires_at_idx on idempotency_records (expires_at);
