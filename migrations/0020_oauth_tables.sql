create table oauth_clients (
  client_id text primary key,
  client_name text not null,
  registration_type text not null,
  redirect_uris text not null,
  scopes text not null,
  token_endpoint_auth_method text not null,
  client_secret_hash text,
  metadata_document_url text,
  created_at text not null,
  rotated_at text
);
create table oauth_authorization_codes (
  code_hash text primary key,
  client_id text not null,
  redirect_uri text not null,
  scope text not null,
  code_challenge text,
  resource text,
  runtime_token_id text not null,
  issued_at text not null,
  expires_at bigint not null,
  consumed_at bigint
);
create table oauth_tokens (
  token_hash text primary key,
  refresh_token_hash text,
  client_id text not null,
  runtime_token_id text not null,
  scope text not null,
  resource text,
  issued_at text not null,
  expires_at bigint not null,
  refresh_expires_at bigint,
  revoked_at bigint
);
create index idx_oauth_tokens_refresh on oauth_tokens(refresh_token_hash);
create index idx_oauth_tokens_grant on oauth_tokens(client_id, runtime_token_id);
create table oauth_signing_keys (
  kid text primary key,
  private_key text not null,
  public_key text not null,
  created_at text not null,
  retired_at text
);
