-- Bind a runtime token to a tenant.
--
-- 0011 partitioned connections by tenant, but a request still names its own tenant, so
-- any caller could reach any partition just by asking. That is fine for admin callers,
-- who are trusted with the whole runtime — it is not fine for runtime tokens, which are
-- what agents hold.
--
-- With this column the tenant becomes a property of the CREDENTIAL rather than of the
-- request: the server reads it from the resolved grant and ignores request-supplied
-- values. An agent can still choose among connection names, but only within the tenant
-- its token was issued for.
--
-- Existing tokens are bound to the 'default' tenant, matching the connection backfill in
-- 0011, so single-tenant deployments are unaffected.

alter table runtime_tokens add column tenant text not null default 'default';
