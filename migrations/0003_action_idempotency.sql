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
