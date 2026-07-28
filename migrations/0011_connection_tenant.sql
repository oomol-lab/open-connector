-- Tenancy: a connection belongs to a tenant.
--
-- Until now the connection store was flat — `primary key (service, connection_name)`
-- meant a single runtime could hold exactly one set of connections, and any caller who
-- could name an alias could reach it. Multi-tenant hosts need connections partitioned
-- by an owner the caller cannot choose for itself.
--
-- SQLite cannot alter a primary key in place, so this rewrites the table, following the
-- same pattern as 0006_connection_identity.sql. Existing rows are adopted by the
-- 'default' tenant, which keeps single-tenant deployments working untouched.
--
-- `oauth_client_configs` is deliberately NOT tenant-scoped: an OAuth client is the
-- operator's app registration with the provider (one GitHub app per deployment), shared
-- by every tenant that authorizes through it. Only the resulting credentials are private.

create table connections_next (
  id text not null unique,
  tenant text not null,
  service text not null,
  connection_name text not null,
  value text not null,
  updated_at text not null,
  revision text not null default '',
  primary key (tenant, service, connection_name)
);

insert into connections_next (id, tenant, service, connection_name, value, updated_at, revision)
select id, 'default', service, connection_name, value, updated_at, revision
from connections;

drop table connections;
alter table connections_next rename to connections;
