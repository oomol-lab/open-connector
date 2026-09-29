# SaaS account cleanup and instance maintenance

Online cleanup deletes ordinary SaaS accounts that a Connect instance created and no longer
uses. Instance reset is an offline operation for creating an independent deployment from a
database copy. It removes local SaaS references without contacting SaaS. Use these operations
for their respective purposes: resetting a clone must not delete the original deployment's accounts.

## Online cleanup

Deleting a SaaS connection immediately removes its local executable reference and atomically
queues the remote account for deletion. Reconnecting queues the old account only after the
replacement commits. Cancelled or superseded authorization requests retain known remote
request/account references in the same transaction.

The worker uses ordinary project-key account deletion, with exact provider configuration,
external user and account selectors. It never revokes a provider token directly. If only a
request ID is known, it queries that request, verifies its identity and alias, persists the
resulting account ID, then deletes the account. A crash after remote deletion can lead to a
repeat of that idempotent deletion; a crash cannot discard the already persisted account ID.

Scheduling defaults:

| Setting                     | Default                                                                         |
| --------------------------- | ------------------------------------------------------------------------------- |
| Node scheduling             | At startup, then 60 seconds after each completed batch                          |
| Workers scheduling          | Cron `* * * * *`, once per minute                                               |
| Maximum batch               | 10 tasks and a 50-second network work budget                                    |
| Per-task network budget     | At most 30 seconds, within the remaining batch budget                           |
| Database lease              | 45 seconds                                                                      |
| Retry delay                 | 60 seconds, doubling up to 5 minutes; a longer valid `Retry-After` is respected |
| Pending authorization check | No sooner than 60 seconds                                                       |

Node starts the worker with the runtime and aborts/waits for it before closing storage.
Workers use the `scheduled` entry point independently of HTTP traffic, catalog assets, transit
storage and public origin. Copy the `triggers.crons` section from `wrangler.example.jsonc` to
your deployment configuration and deploy it. Verify the trigger and invocation logs in your
actual Cloudflare deployment; the presence of source code does not establish that cron is enabled.
Apply migrations through `0015_saas_cleanup_runtime.sql` before enabling the new scheduler.
Node applies its migrations when opening the database. For D1, use the selected configuration:

```bash
npx wrangler d1 migrations apply DB --remote --config wrangler.local.jsonc
```

Keep replica clocks synchronized because leases and retry timestamps use wall-clock time.

`GET /api/oauth/managed-project` reports `cleanup.pending`, `cleanup.manual` and
`cleanup.paused`. A rejected project key pauses automatic claiming for the project and logs a
safe diagnostic. Re-save a valid project key through `PUT /api/oauth/managed-project` to clear
the pause. Key replacement cannot change the bound project or origin. Transient network and
storage errors keep the work for a later batch. Project deletion remains blocked while any
cleanup records or other source references remain.

Unknown link outcomes, unverifiable request identities and missing retained request results
require manual inspection. They are never reported as successfully cleaned and never cause
a replacement link to be created. Requests whose local recovery retention has elapsed are
queued before their payload is cleared. If the SaaS result has already been removed, an
operator must locate the account using the project, external user and attempt alias
`connect-<local-request-id>` in SaaS account management. Do not delete an unrelated account
with the same provider profile.

For diagnosis, inspect these non-secret columns in the selected Connect database:

```sql
select id, managed_project_id, provider_config_id, external_user_id,
       remote_request_id, remote_account_id, status, attempts, error_code
from saas_cleanup
order by created_at, id;
```

After verifying or completing remote cleanup manually, an operator can remove only the
corresponding `manual` task by exact ID in the selected database. Retain a record of that
verification. Do not clear pending work or reset the database to hide an outage.

## Offline Node maintenance

Stop every Connect process that uses the target database and wait for in-flight requests and
cleanup to finish. Back up the database. The maintenance commands do not coordinate shutdown
of other processes, and must not run concurrently with active writers.

For an independent SQLite clone:

```bash
node scripts/runtime-data.ts reset-instance --yes --data-dir /path/to/cloned-data
```

For an independent PostgreSQL clone, set `OOMOL_CONNECT_DATABASE_URL` to the clone through
your normal secret configuration, then run:

```bash
node scripts/runtime-data.ts reset-instance --yes
```

The command displays the current instance ID and affected counts, then atomically removes
SaaS connections, SaaS authorization requests, source defaults, project configuration and
cleanup records, and assigns a new instance ID. Local connections, local authorization
requests, Marketplace configuration and unrelated runtime data remain. No SaaS requests are
sent. Preserve the existing encryption key to read the retained local data.

To restore the original deployment from backup, retain its instance ID and do not run this
command. Ordinary `reset --yes` clears runtime data while preserving instance identity and
also makes no SaaS calls. Normal retirement should complete online cleanup first; remote
accounts left by offline resets require manual SaaS account management.

Existing Node `rotate-key` maintenance includes the project key and encrypted request data.
A configured SaaS project prevents `rotate-key --plain`; remove its source references and
finish cleanup before removing the project. These Node commands do not operate on D1.

## Offline D1 maintenance

The D1 command and temporary Worker are implemented and have automated transaction and
recovery tests. Actual Cloudflare deployment, D1 rollback and operational recovery still
require validation on a dedicated test database before production use. This command does
not rotate encryption keys or implement a full D1 runtime reset.

1. Back up the target database. Stop **all** HTTP writers, cron triggers, queue consumers and
   other deployments sharing that D1 binding. Wait for in-flight work to finish. Keep them
   stopped through verification and temporary Worker deletion.
2. Select an explicit Wrangler configuration, and `--env` if using a named environment. It
   must contain one `DB` binding with the intended database ID and name. Set `account_id` in
   the configuration or `CLOUDFLARE_ACCOUNT_ID` in your environment; the command does not
   silently choose among accounts. Authenticate Wrangler using your existing deployment
   credentials.
3. Inspect the target and counts before resetting:

   ```bash
   node scripts/d1-runtime-data.ts reset-instance \
     --config wrangler.local.jsonc --remote \
     --operation-file .tmp/d1-clone-reset.json
   ```

   This deploys an authenticated temporary maintenance Worker, reads the target identity and
   counts, and removes the Worker. It does not reset the instance without `--yes`.

4. Confirm the printed account, database ID, old identity and affected counts. Run the same
   operation with `--yes`, which confirms that all writers remain stopped:

   ```bash
   node scripts/d1-runtime-data.ts reset-instance \
     --config wrangler.local.jsonc --remote --yes \
     --operation-file .tmp/d1-clone-reset.json
   ```

   The operation file is written before reset is sent and retains the old/new IDs and a
   dedicated random maintenance token. It has mode `0600`; keep it private and outside
   version control. The temporary Worker receives the token through Wrangler's secret
   input, never as a project key or command-line argument.

5. Confirm the new identity and zero SaaS counts printed after reset. Confirm deletion of the
   temporary Worker and its secret. Keep the original production encryption key unchanged,
   then restore business deployments and cron triggers. Check a retained local connection
   and Marketplace configuration before configuring a new SaaS project for the clone.

The Worker performs all deletes and the identity update in **one D1 batch**. Every delete
checks the expected old identity in SQL, and the new identity is written last. A failed batch
must roll back completely. A different current identity produces a conflict with zero
changes. An identical retry observes the same new ID and does not delete any additional data.

If a request times out or its response is lost, keep writers stopped and rerun with the **same
operation file**. Do not delete the file or generate a new identity to recover the operation.
The command redeploys the same temporary Worker, reuses the saved IDs, verifies the outcome
and removes the Worker again. If the batch exceeds a D1 limit, resolve that limit while
keeping the deployment offline; do not split the reset into partially applied batches.

The script attempts Worker deletion even when an operation fails. If cleanup fails, it exits
unsuccessfully and prints the exact temporary Worker name, account and configuration path.
Use that generated configuration to remove only the temporary Worker:

```bash
npx wrangler delete --config <temporary-config-path> --force
```

A force-killed script may leave the Worker deployed. Re-running the same operation file can
finish recovery and cleanup; alternatively remove the named temporary Worker before restoring
service. Keep the recovery file until the result and endpoint removal have been verified.
Use a different operation file only for a genuinely new reset operation.

## Deployment validation still required

Use a dedicated D1 database containing both SaaS and local records. Record the old identity,
counts, local records and Marketplace configuration before testing:

- Inject a failure on a later delete in the maintenance batch, verify all earlier deletes and
  the identity change rolled back, then remove the failure and retry the same operation.
- Lose the reset response after commit, retry with the same saved IDs, and verify no second
  deletion occurs.
- Submit two operations with the same old ID and different new IDs. Exactly one may reset;
  the other must report a conflict.
- Send a wrong database ID, wrong expected instance ID and invalid maintenance token. Verify
  no data changes occur.
- Verify the operation sends no SaaS requests, preserves local/Marketplace data and their
  encryption key, and leaves no temporary Worker or maintenance secret.
- Restore cron and verify a queued test account is deleted without making an HTTP request to
  Connect. Check error-key pause and recovery with a valid replacement key.

SQLite-backed D1 tests demonstrate the SQL and batch logic, not deployment support or the
Cloudflare platform's actual rollback limits. Record those real-environment results separately.
