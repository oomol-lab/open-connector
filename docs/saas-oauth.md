# SaaS OAuth connections

Connect can keep an OAuth account on SaaS and execute its actions and proxy requests there.
Third-party access tokens, refresh tokens, OAuth client secrets and provider secrets stay on
SaaS. Connect stores the encrypted project key, stable local connection identity, remote account
reference and a safe account summary. Inputs and outputs travel through SaaS.

This is separate from Marketplace: a Marketplace key enables its virtual action connections;
a project key authorizes ordinary OAuth accounts belonging to that SaaS project. Use the
matching configuration screen and credential for each.

## Configure the Console

1. Configure encrypted storage and an administrator token. Set OOMOL_CONNECT_ORIGIN to the
   exact public HTTP(S) origin used to open Console, including the port when applicable.
   Workers require this explicit setting; request-host inference is not used. Behind a reverse
   proxy, use the external origin and preserve the browser's Origin header. A different Console
   hostname will fail the protected synchronization check. `localhost` and `127.0.0.1` are
   different origins and do not share login cookies. `npm run dev` defaults the origin to
   `http://localhost:5173` unless explicitly overridden; its Vite server forwards `/oauth`
   completion and callback routes to the API.
2. Open **OAuth Apps → OOMOL cloud authorization**. Enter the project API key. New configurations
   use the official SaaS at https://connector.oomol.com; updating a key keeps the saved address.
   Connect checks discovery and project identity before saving. The key is never returned;
   replacing it requires entering the replacement key. Changing the origin or project requires
   removing the current configuration after clearing its references.
3. Configure the provider's OAuth app and scopes on SaaS. In Connect, open the provider's
   OAuth settings and select the corresponding provider config under **Default OAuth source**.
   Review its callback URL, scopes, compatible action count and proxy capability, then save.
   This selection affects new OAuth connections. Existing connections retain their original
   source and account identity when reconnecting.
4. Open the provider's connection page, name the connection and authorize. SaaS mode does not
   need local client fields or per-request scope selection. Keep the completion page open.
   If a popup is blocked, use the authorization link displayed in the connection form.
5. Confirm the connection appears with its local alias and SaaS source. Select that connection
   explicitly for execution and restrict runtime tokens with allowedConnections as appropriate.

Saving a local OAuth app remains available under the local configuration section. It does not
switch the default source or migrate existing connections. API-key and custom-credential
connections keep their normal behavior.

The project panel shows availability and cleanup counts. A stored project can be unavailable
or have an invalid key without becoming unconfigured. Correct a rejected key by re-saving
a valid key for the same project; this also resumes paused cleanup. To remove the configuration,
switch each service default to local, remove its SaaS connections, and resolve pending requests
and cleanup tasks. This operation does not delete the project on SaaS.

## Programmatic authorization

Use the administrator-authenticated /v1/connections/:service/connect and
/v1/connections/by-id/:appId/connect endpoints. The former uses the service default; the latter
retains the saved source. For SaaS, send no client config, scope, extra or secret overrides.
The normal request and connection envelopes are described in
[programmatic connections](programmatic-connections.md).

GET /v1/providers/:service/setup keeps configured, customClientAvailable,
expectedRedirectUri and missingFields inside oauthClient. With a SaaS default, it reports
configured, disallows a custom client, returns the SaaS callback and does not require local
client fields. Source configuration can be read separately at /api/oauth/sources/:service.
SaaS discovery failures return an explicit error; they never switch setup to a local source.
The Console's /api/oauth/configs keeps local app configuration and adds oauthSource.

Poll known request IDs no faster than every two seconds and honor Retry-After.
An explicit valid administrator Bearer GET can synchronize a SaaS request and commit its
connection. Cookie-only GET is read-only. Console and the completion page use same-origin JSON
POST to /api/oauth/connection-requests/:id/sync with X-OpenConnector-Request: sync.
A client without a Console browser session completes by Bearer polling. Invalid authorization
must be fixed before retrying; it is not an instruction to create another link.

Console starts named, configured OAuth requests at POST /api/oauth/connection-requests,
with service, connectionName, optional appId for reconnect, and local-only
authorizationOptionIds. This is an administrator route. SDK consumers should use /v1.
Custom local clients continue to use the local authorization API and are unavailable when
the service default is SaaS.

Never automatically repeat authorization creation after oauth_source_result_unknown.
That error means the link might exist even though its response was lost. Inspect and clean
up the attempt before explicitly starting another.

## Execution, cancellation and metering

Local input schemas and action, proxy and connection policies run before SaaS execution.
The selected account must match the project, service, provider config and external user.
Only the intersection of the local catalog and SaaS capabilities can execute on that connection;
the global catalog remains unchanged.

Connect preserves safe error codes, applicable Retry-After, its local execution ID and the
separate remoteExecutionId. See [runtime API](runtime-api.md#saas-connection-execution) for
supported proxy values, response formats and budgets. Non-finite query numbers, HEAD, complex
query/header values, access grants and unsupported body encodings are rejected.

A client cancellation ends Connect's wait. The SaaS action or provider may still finish, and
a disconnected HTTP client is not guaranteed to cancel the remote operation. A timeout or lost
response does not prove that a write failed. Do not automatically replay it, switch accounts
or run it locally. Check the remote execution and provider resource before retrying. Proxy
cancellation can reach an abortable upstream request but does not undo an already applied effect.

Inspect usage, remaining credits and any applicable limits in the SaaS project's management
and billing interface. Use execution IDs and timestamps to correlate calls. Connect does not
display a live balance or impose a new project spending cap. Metering events and cleanup
counters are not rate-limit or cost-limit guarantees.

## Unknown results, long outages and lost databases

SaaS request results are retained through their expiry plus 24 hours; account deletion is
separate. After a long outage, a known request may no longer be queryable. Connect marks
unresolved cleanup for manual attention instead of claiming success.

In ordinary SaaS account management, select the bound project and provider configuration,
then locate the external user `open-connector:<instanceId>` and attempt alias
`connect-<local-request-id>`. Compare account ID, creation time and the safe account summary.
Delete only the verified unused account using ordinary SaaS account deletion. A matching
email or display name alone is insufficient evidence.

If the Connect database is lost, recover the instance ID and request/account references from
a backup or your operation records. Without those records, inspect the SaaS project's ordinary
account list and audit history to identify abandoned attempts. If ownership or active use
cannot be established, leave the account for operator investigation. Recreating a local
database cannot recover unknown account references automatically.

For known pending work, restore the valid source/key and scheduler so cleanup can resume.
For manual work, record the verified remote result before removing only the matching manual
task. Do not reset storage to conceal cleanup failures. Scheduling, SQL diagnostics, backup
restoration and independent clone reset are in [SaaS maintenance](saas-maintenance.md).
Keep clocks synchronized on all replicas for leases and retry timestamps.

## Switching to local OAuth during a sustained outage

1. Preserve the SaaS connection and its pending cleanup records. Register and save a local
   OAuth client, then change the service default to local.
2. Create a **new local connection with a different alias** and authorize it normally.
   Reconnecting the old SaaS connection will still use SaaS.
3. Test a read action with the new connection, verify the intended account and scopes, and
   perform a controlled write only against a disposable test resource.
4. Update client selectors and runtime-token allowedConnections to the new local ID.
   Verify access policies and every consumer before directing production calls to it.
5. Decide whether to retain or delete the old SaaS connection. Deletion queues remote cleanup;
   restore the source/key and scheduler or complete verified manual cleanup when SaaS recovers.

No third-party token is copied to Connect and no automatic fallback is installed.
