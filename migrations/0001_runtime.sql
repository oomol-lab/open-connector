create table if not exists connections (
  service text not null,
  connection_name text not null,
  value text not null,
  updated_at text not null,
  primary key (service, connection_name)
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
  revoked_at text
);

create table if not exists runs (
  id text primary key,
  action_id text not null,
  started_at text not null,
  completed_at text not null,
  ok integer not null,
  value text not null
);
