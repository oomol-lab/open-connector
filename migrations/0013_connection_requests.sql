create table connection_requests (
  id text primary key,
  owner text not null,
  service text not null,
  state text not null unique,
  phase text not null check (phase in ('pending', 'processing', 'completed')),
  status text not null check (status in ('initiated', 'connected', 'failed')),
  value text,
  app_id text,
  error_code text,
  error_message text,
  expires_at text not null,
  created_at bigint not null,
  updated_at bigint not null
);
create index connection_requests_expires on connection_requests (expires_at);
create index connection_requests_pending on connection_requests (owner, service) where phase = 'pending';
