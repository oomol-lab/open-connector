# Security Policy

OpenConnector (`oomol-lab/open-connector`) is a connector gateway that stores and brokers sensitive
user credentials — API keys, OAuth client secrets, and OAuth access/refresh tokens — on behalf of
many third-party providers. It may also retain completed Action response payloads for idempotent
HTTP retries. We take security reports seriously and are grateful to the researchers and users who
help keep the project and its users safe.

This policy explains which versions receive security fixes, how to report a vulnerability privately,
what to expect after you report, and how operators and contributors share responsibility for keeping
credentials safe.

## Supported Versions

Security fixes are delivered on the **latest released version** and the **`main`** branch. We
recommend always running the latest release.

| Version                 | Security fixes |
| ----------------------- | -------------- |
| Latest release / `main` | ✅             |
| Older releases          | ❌             |

## Reporting a Vulnerability

**Please report security vulnerabilities privately.** Do not open a public issue, pull request, or
discussion, and do not post details on social media or any other public channel, until we have
released a fix and coordinated disclosure with you. Public reports expose every user of the project
to the vulnerability before a patch exists.

Use one of these private channels:

1. **GitHub private vulnerability reporting (preferred).** Open
   <https://github.com/oomol-lab/open-connector/security/advisories/new>, or go to the repository's
   **Security** tab → **Advisories** → **Report a vulnerability**. This creates a private advisory
   visible only to you and the maintainers, and is the fastest path to a coordinated fix and a CVE.
2. **Email.** If GitHub private reporting is unavailable to you, email **support@oomol.com** with
   the subject line prefixed `[security]`. Use this only as a fallback; it is not an encrypted
   channel, so keep secrets out of the message (see below).

If you do not receive an acknowledgement within **3 business days**, please re-send through the other
channel in case a message was missed.

### What to include

A good report lets us reproduce and assess the issue quickly. Where possible, include:

- A description of the vulnerability and its security impact (what an attacker can do).
- Step-by-step reproduction, proof-of-concept, or the relevant code path.
- The affected version, release, or commit, and the **deployment mode** (local Docker/Node or
  Cloudflare Workers).
- Any known mitigation or workaround.

### Protect secrets in your report

Because this project handles credentials, **do not include real user tokens, API keys, OAuth client
secrets, passwords, or customer data** in your report. Redact them and use placeholder values (for
example, `github_pat_REDACTED`). If a proof-of-concept requires a credential, describe how to
generate a disposable test one instead of sharing a live secret.

## What to Expect After Reporting

We follow a coordinated disclosure process:

- **Acknowledgement** within **3 business days** that we received your report.
- An **initial assessment and expected timeline** within **10 business days**. We triage by severity
  using [CVSS](https://www.first.org/cvss/calculator/4.0).
- **Regular status updates** as we work on a fix, and notification when it ships.
- **Credit** to you in the advisory and release notes when the fix is published, unless you ask to
  remain anonymous.

## Coordinated Disclosure

- Keep the report **private** until a fix is released. We aim to publish within **90 days** of the
  report; for actively exploited issues we move faster.
- We develop and review the fix in a **private** GitHub security advisory or fork — never in a public
  issue or pull request, which would reveal the vulnerability before a patch is available.
- When the fix is ready, we publish a **GitHub Security Advisory** and, for qualifying issues, request
  a **CVE** through GitHub (a CVE Numbering Authority) so downstream users are notified.
- We will coordinate the public disclosure date with you and credit your contribution.

## Scope

**In scope** — vulnerabilities in this repository's own code and defaults, for example:

- Credential storage and at-rest encryption (`src/server/secrets/*`), key handling, and token
  management.
- Runtime authentication and authorization: the admin bearer token, runtime tokens (`oct_…`),
  session cookies, and the OAuth authorization/callback flow.
- Leakage of secrets through API responses, run logs, or error messages (log redaction bypasses).
- Action allow/block policy bypass, SSRF, injection, path traversal, or transit-file abuse in the
  gateway and its executors.
- The Web Console, the HTTP/OpenAPI and MCP surfaces, and the Cloudflare Workers deployment code.

**Out of scope** — please do not report these as vulnerabilities in OpenConnector:

- Vulnerabilities in third-party providers or their APIs. Report those to the provider.
- Insecure **self-hosted configuration** that this project documents how to avoid — for example
  running without `OOMOL_CONNECT_ENCRYPTION_KEY`, running without `OOMOL_CONNECT_ADMIN_TOKEN`,
  binding to `0.0.0.0` on an untrusted network, or exposing the SQLite/D1/R2 data store. See
  [Hardening your deployment](#hardening-your-deployment).
- The hosted [OOMOL](https://oomol.com/) service and other OOMOL products. These are maintained
  separately from this repository and are not covered by this policy; report issues in them to
  support@oomol.com.
- Reports from automated scanners with no demonstrated impact, missing security headers without a
  concrete exploit, volumetric denial-of-service, social engineering, and physical attacks.

## Safe Harbor

We will not pursue or support legal action against researchers who, in good faith:

- follow this policy and stay within the scope above,
- avoid privacy violations, data destruction, and disruption of others' service, and
- give us a reasonable opportunity to remediate before any disclosure.

If in doubt about whether an action is authorized, ask us first at support@oomol.com. We do not
currently run a paid bug-bounty program, but we credit every reporter whose finding leads to a fix.

## Hardening Your Deployment

OpenConnector can be self-hosted and holds live provider credentials, so operators share
responsibility for securing their deployment. At minimum:

- **Enable at-rest encryption.** Set `OOMOL_CONNECT_ENCRYPTION_KEY` so stored credentials, OAuth
  client configuration, and completed idempotent Action response payloads are encrypted
  (AES-256-GCM). Without it, those payloads are stored in plaintext; completed responses may contain
  sensitive provider data. The raw `Idempotency-Key` is not stored, but its hash, request
  fingerprint, claim state, and timestamps remain unencrypted metadata. Store the encryption key
  outside the database; losing it makes encrypted records unrecoverable.
- **Require authentication.** Set `OOMOL_CONNECT_ADMIN_TOKEN` to protect `/api`, `/docs`, and the Web
  Console, and issue scoped runtime tokens or configure JWT access-token verification for `/v1` and
  `/mcp`. Both admin and runtime authentication are disabled by default for local development.
- **Control network exposure.** The Node server binds `127.0.0.1` by default; the Docker image binds
  `0.0.0.0`. Only expose the gateway on a trusted network or behind an authenticated proxy, and never
  expose it publicly without admin and runtime authentication enabled.
- **Protect the data store.** The SQLite database (local), D1 (Cloudflare), and R2 transit files
  contain sensitive material even when encrypted. Restrict file permissions and access, and store
  Cloudflare secrets with `wrangler secret put`. Idempotent Action responses are eligible for replay
  for 24 hours, but expired records are removed opportunistically rather than by a physical-deletion
  deadline.
- **Reduce attack surface.** Use `OOMOL_CONNECT_ALLOWED_ACTIONS` / `OOMOL_CONNECT_BLOCKED_ACTIONS` to
  limit which Actions can run. Restrict provider proxies separately with
  `OOMOL_CONNECT_ALLOWED_PROXIES` / `OOMOL_CONNECT_BLOCKED_PROXIES`: `/v1/proxy/:service` can reach
  provider API endpoints beyond the curated Action catalog, every proxy is allowed until one of those
  variables restricts it, and the Action variables do not restrict it. Pin it to the services you
  actually proxy, or set `OOMOL_CONNECT_BLOCKED_PROXIES="*"` to disable provider proxies entirely.
- **Stay current.** Run a supported Node.js (22.18+ / 24) and update to the latest OpenConnector
  release for security fixes.

See [docs/credentials.md](docs/credentials.md), [docs/configuration.md](docs/configuration.md), and
[docs/cloudflare.md](docs/cloudflare.md) for full guidance.

## Handling Credentials in the Codebase

For contributors and anyone working with this repository:

- **Never commit** credentials, tokens, OAuth client secrets, API keys, `.env` files, or captured
  provider responses that contain user data.
- If a secret is committed by mistake, treat it as **compromised**: revoke and rotate it at the
  provider immediately, then report it privately through the channels above. Removing it from later
  commits or rewriting git history is not sufficient — assume it was captured.
- Keep provider secrets behind the runtime boundary. Do not add logging, error messages, or API
  responses that echo raw tokens, client secrets, or authorization headers; the run-log summarizer
  and logger redaction exist to prevent this and should not be weakened.

Thank you for helping keep OpenConnector and its users secure.
