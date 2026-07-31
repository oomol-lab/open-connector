-- Bind a runtime token to a set of connection names within its own tenant.
-- Mirrors migrations/0013_runtime_token_connections.sql (SQLite/D1). NULL (the default,
-- and every pre-existing row) means unrestricted, matching today's behavior exactly.
alter table runtime_tokens add column allowed_connections text;
