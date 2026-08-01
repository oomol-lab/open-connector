-- Bind a runtime token to a set of connection names within its own tenant.
--
-- 0012 bound a token's tenant to the credential rather than the request, but a token
-- could still name ANY connection within that tenant -- e.g. a token minted for one
-- GitHub account could name a different GitHub account under the same tenant, if a
-- tenant ever had more than one. This column closes that: NULL (the default, and what
-- every existing token gets) means unrestricted, matching today's behavior exactly.
-- A token minted with an explicit list is confined to naming only those connections.

alter table runtime_tokens add column allowed_connections text;
