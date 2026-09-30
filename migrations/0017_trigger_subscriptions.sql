create table trigger_subscriptions (
  id text primary key,
  mode text not null,
  token_id text not null,
  connection_id text not null,
  trigger_id text not null,
  status text not null,
  reconcile_at bigint not null,
  maintenance_at bigint not null default 0,
  lease_owner text,
  lease_until bigint,
  value text not null
);
create index trigger_subscriptions_connection on trigger_subscriptions (connection_id, status);
create index trigger_subscriptions_maintenance on trigger_subscriptions (status, maintenance_at);

alter table connections add column provider_account_id text;
