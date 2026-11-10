create table custom_mcp (
  service text primary key,
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
  revision text not null
);
