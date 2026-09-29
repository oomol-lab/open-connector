create table instance_identity (
  id integer primary key check (id = 1),
  instance_id text not null unique
);
create table managed_project (
  id integer primary key check (id = 1),
  managed_project_id text not null unique,
  project_id text not null,
  base_url text not null,
  value text not null
);
create table oauth_sources (
  service text primary key,
  managed_project_id text not null,
  provider_config_id text not null
);
alter table connections add column source text not null default 'local' check (source in ('local', 'saas'));
alter table connections add column managed_project_id text;
alter table connections add column provider_config_id text;
alter table connections add column external_user_id text;
alter table connections add column remote_account_id text;
alter table connections add column local_request_id text;
alter table connection_requests add column kind text not null default 'local' check (kind in ('local', 'saas'));
alter table connection_requests add column managed_project_id text check (kind = 'local' or managed_project_id is not null);
alter table connection_requests add column provider_config_id text;
alter table connection_requests add column external_user_id text;
alter table connection_requests add column remote_request_id text;
alter table connection_requests add column remote_account_id text;
alter table connection_requests add column lease_id text;
alter table connection_requests add column lease_until bigint;
alter table connection_requests add column next_poll_at bigint not null default 0;
create table saas_cleanup (
  id text primary key,
  managed_project_id text not null,
  provider_config_id text not null,
  external_user_id text not null,
  remote_request_id text,
  remote_account_id text,
  status text not null default 'pending' check (status in ('pending', 'manual')),
  attempts integer not null default 0,
  next_attempt_at bigint not null default 0,
  lease_id text,
  lease_until bigint,
  created_at bigint not null,
  error_code text
);
create index saas_cleanup_due on saas_cleanup (status, next_attempt_at, lease_until);
create index connections_managed_project on connections (managed_project_id);
create index connection_requests_managed_project on connection_requests (managed_project_id);

alter table connection_requests add column saas_phase text check (saas_phase in ('creating', 'pending', 'candidate'));
alter table connection_requests add column candidate_value text;

alter table connection_requests add column return_uri text;
alter table connection_requests add column poll_attempts integer not null default 0;
