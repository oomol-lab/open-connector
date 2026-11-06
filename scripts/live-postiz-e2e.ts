/**
 * Live end-to-end check of the postiz provider against a real self-hosted
 * instance. Run with:
 *   OOMOL_CONNECT_ALLOW_PRIVATE_NETWORK=1 \
 *   POSTIZ_API_KEY=... POSTIZ_BASE_URL=http://192.168.31.10:5005 \
 *   node scripts/live-postiz-e2e.ts
 *
 * Exercises the real provider code paths (no mocks): credential validation,
 * the proxy, and the read actions. create_post only runs when
 * POSTIZ_DRAFT_CHANNEL is set, and always as a draft.
 */
import type { ExecutionContext, ResolvedCredential } from "../src/core/types.ts";

import { withProviderNetworkPolicy } from "../src/core/provider-network-policy.ts";
import { credentialValidators, executors, proxy } from "../src/providers/postiz/executors.ts";

const apiKey = process.env.POSTIZ_API_KEY;
const baseUrl = process.env.POSTIZ_BASE_URL ?? "";
if (!apiKey) {
  console.error("POSTIZ_API_KEY is required");
  process.exit(1);
}

const resolved = {
  authType: "api_key",
  apiKey,
  values: { apiKey, baseUrl },
  profile: { accountId: "postiz:live", displayName: "Postiz live", grantedScopes: [] },
  metadata: {},
} as unknown as Extract<ResolvedCredential, { authType: "api_key" }>;

const context: ExecutionContext = { getCredential: async () => resolved };
const failures: string[] = [];

function step(name: string, ok: boolean, detail: unknown): void {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : `  ${JSON.stringify(detail)}`}`);
  if (!ok) failures.push(name);
}

await withProviderNetworkPolicy({ allowPrivateNetwork: true }, async () => {
// 1. Credential validation against <base>/api/public/v1/is-connected.
const validation = await (credentialValidators.apiKey!(
  { apiKey, values: { apiKey, baseUrl } },
  { fetcher: globalThis.fetch },
) as Promise<{ metadata: { apiBaseUrl: string } }>)
  .then((r) => ({ ok: true as const, r }), (e: Error) => ({ ok: false as const, e }));
step(
  "validate /is-connected",
  validation.ok && String(validation.r.metadata.apiBaseUrl).endsWith("/api/public/v1"),
  validation.ok ? validation.r.metadata : validation.e.message,
);
const liveBaseUrl = validation.ok ? String(validation.r.metadata.apiBaseUrl) : null;

// 2. list_integrations — real channels come back.
const integrations = await executors["postiz.list_integrations"]!({}, context);
const integrationList = Array.isArray(integrations.output) ? (integrations.output as Array<Record<string, unknown>>) : [];
step(
  "list_integrations",
  integrations.ok && Array.isArray(integrations.output),
  integrations.ok ? integrationList.map((i) => `${i.name} (${i.identifier})`) : integrations.error,
);

// 3. Raw proxy passthrough.
const proxied = await proxy({ method: "GET", endpoint: "/integrations" }, context);
step("proxy GET /integrations", proxied.ok, proxied.ok ? undefined : proxied.error);

// 4. list_posts over a short past window.
const now = new Date();
const start = new Date(now.getTime() - 7 * 24 * 3600 * 1000);
const posts = await executors["postiz.list_posts"]!(
  { startDate: start.toISOString(), endDate: now.toISOString() },
  context,
);
step("list_posts", posts.ok, posts.ok ? "ok" : posts.error);

// 5. Optional draft post (never publishes; requires a channel id).
const draftChannel = process.env.POSTIZ_DRAFT_CHANNEL;
if (draftChannel && integrationList.some((i) => i.id === draftChannel)) {
  const created = await executors["postiz.create_post"]!(
    {
      type: "draft",
      date: new Date(now.getTime() + 3600 * 1000).toISOString(),
      shortLink: false,
      tags: [],
      posts: [
        {
          integration: { id: draftChannel },
          value: [{ content: "open-connector postiz provider: self-hosted base URL end-to-end check", image: [] }],
        },
      ],
    },
    context,
  );
  step("create_post (draft)", created.ok, created.ok ? created.output : created.error);
} else {
  console.log("SKIP  create_post (draft)  POSTIZ_DRAFT_CHANNEL not set or unknown channel");
}

  console.log(`\nbase URL resolved to: ${liveBaseUrl ?? "(validation failed)"}`);
});
console.log(failures.length === 0 ? "ALL LIVE CHECKS PASSED" : `${failures.length} CHECK(S) FAILED`);
process.exit(failures.length === 0 ? 0 : 1);
