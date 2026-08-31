import type { ExecutionContext, ResolvedCredential } from "../core/types.ts";

import { Buffer } from "node:buffer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setDefaultGuardedFetchDnsLookup } from "../core/guarded-fetch.ts";
import { executors as clickhelpExecutors } from "./clickhelp/executors.ts";
import { executors as dealroomExecutors } from "./dealroom/executors.ts";
import { proxy as echotikProxy } from "./echotik/executors.ts";
import { proxy as helpdeskProxy } from "./helpdesk/executors.ts";
import { proxy as mxProxy } from "./mx/executors.ts";
import { defineProviderProxy } from "./provider-runtime.ts";
import { proxy as razorpayProxy } from "./razorpay/executors.ts";
import { executors as stannpExecutors } from "./stannp/executors.ts";
import { proxy as woocommerceProxy } from "./woocommerce/executors.ts";
import { proxy as zendeskProxy } from "./zendesk/executors.ts";

beforeEach(() => {
  // The providers below reach the network through the guarded fetch, which
  // resolves the target host unless the provider opts out. The stubbed fetch
  // never leaves the process, so drop the DNS step.
  setDefaultGuardedFetchDnsLookup(null);
});

afterEach(() => {
  setDefaultGuardedFetchDnsLookup(undefined);
  vi.unstubAllGlobals();
});

interface RecordedFetchCall {
  init: RequestInit | undefined;
}

function captureFetchCalls(): RecordedFetchCall[] {
  const calls: RecordedFetchCall[] = [];
  vi.stubGlobal("fetch", async (_input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ init });
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  });
  return calls;
}

function sentAuthorization(calls: RecordedFetchCall[]): string | null {
  return new Headers(calls[0]?.init?.headers).get("authorization");
}

function apiKeyContext(apiKey: string, values: Record<string, string> = { apiKey }): ExecutionContext {
  const credential: ResolvedCredential = {
    authType: "api_key",
    apiKey,
    values,
    profile: { accountId: "acct", displayName: "Test", grantedScopes: [] },
    metadata: {},
  };
  return { getCredential: async () => credential };
}

function customCredentialContext(values: Record<string, string>): ExecutionContext {
  const credential: ResolvedCredential = {
    authType: "custom_credential",
    values,
    profile: { accountId: "acct", displayName: "Test", grantedScopes: [] },
    metadata: {},
  };
  return { getCredential: async () => credential };
}

describe("api_key_basic proxy authorization", () => {
  const basicProxy = defineProviderProxy({
    service: "test_service",
    baseUrl: "https://api.example.com/v1/",
    auth: { type: "api_key_basic" },
    skipDnsValidation: true,
  });

  // RFC 7617 says the Basic credential is encoded from its UTF-8 bytes. These
  // three keys pin the ASCII case (must stay byte-identical), the Latin-1
  // representable case (wrong bytes before the fix), and the case `btoa` cannot
  // encode at all (a DOMException before the fix).
  const keys = [
    { label: "an ASCII", key: "waka_ascii_key" },
    { label: "a Latin-1 representable", key: "wäka_key_ü" },
    { label: "a non-Latin-1", key: "密钥_key" },
  ];

  for (const { label, key } of keys) {
    it(`encodes ${label} API key as UTF-8 base64`, async () => {
      const calls = captureFetchCalls();

      const result = await basicProxy({ method: "GET", endpoint: "/users/current" }, apiKeyContext(key));

      expect(result.ok).toBe(true);
      expect(sentAuthorization(calls)).toBe(`Basic ${Buffer.from(key, "utf8").toString("base64")}`);
    });
  }

  it("keeps the auth suffix inside the encoded credential", async () => {
    const suffixProxy = defineProviderProxy({
      service: "test_service",
      baseUrl: "https://api.example.com/v1/",
      auth: { type: "api_key_basic", suffix: ":" },
      skipDnsValidation: true,
    });
    const calls = captureFetchCalls();

    const result = await suffixProxy({ method: "GET", endpoint: "/users/current" }, apiKeyContext("密钥_key"));

    expect(result.ok).toBe(true);
    expect(sentAuthorization(calls)).toBe(`Basic ${Buffer.from("密钥_key:", "utf8").toString("base64")}`);
  });
});

interface HandWrittenBasicCase {
  readonly provider: string;
  readonly composed: string;
  readonly run: () => Promise<unknown>;
}

// Every provider that builds its own Basic header, with a distinct value per
// field so the pair, its order, and its separator are all pinned. Folding these
// sites onto `basicAuthorizationHeader` had to keep the composed credential
// character for character; nothing else here asserts that.
const handWrittenCases: HandWrittenBasicCase[] = [
  {
    provider: "clickhelp",
    composed: "clickhelp-login:clickhelp-key",
    run: () =>
      clickhelpExecutors["clickhelp.list_projects"]!(
        {},
        apiKeyContext("clickhelp-key", { login: "clickhelp-login", portalUrl: "https://portal.example.com" }),
      ),
  },
  {
    provider: "dealroom",
    composed: "dealroom-key:",
    run: () => dealroomExecutors["dealroom.search_companies"]!({ keyword: "acme" }, apiKeyContext("dealroom-key")),
  },
  {
    provider: "echotik",
    composed: "echotik-user:echotik-password",
    run: () =>
      echotikProxy(
        { method: "GET", endpoint: "/echotik/category/l1" },
        customCredentialContext({ username: "echotik-user", password: "echotik-password" }),
      ),
  },
  {
    provider: "helpdesk",
    composed: "helpdesk-account:helpdesk-key",
    run: () =>
      helpdeskProxy(
        { method: "GET", endpoint: "/tickets" },
        apiKeyContext("helpdesk-key", { accountId: "helpdesk-account" }),
      ),
  },
  {
    provider: "mx",
    composed: "mx-client:mx-key",
    run: () => mxProxy({ method: "GET", endpoint: "/users" }, apiKeyContext("mx-key", { clientId: "mx-client" })),
  },
  {
    provider: "razorpay",
    composed: "razorpay-key-id:razorpay-secret",
    run: () =>
      razorpayProxy(
        { method: "GET", endpoint: "/payments" },
        apiKeyContext("razorpay-secret", { keyId: "razorpay-key-id" }),
      ),
  },
  {
    provider: "stannp",
    composed: "stannp-key:",
    run: () => stannpExecutors["stannp.get_account_balance"]!({}, apiKeyContext("stannp-key", { region: "eu" })),
  },
  {
    provider: "woocommerce",
    composed: "woo-consumer-key:woo-consumer-secret",
    run: () =>
      woocommerceProxy(
        { method: "GET", endpoint: "/products" },
        customCredentialContext({
          storeUrl: "https://store.example.com",
          consumerKey: "woo-consumer-key",
          consumerSecret: "woo-consumer-secret",
        }),
      ),
  },
  {
    provider: "zendesk",
    composed: "agent@example.com/token:zendesk-token",
    run: () =>
      zendeskProxy(
        { method: "GET", endpoint: "/api/v2/tickets" },
        apiKeyContext("zendesk-token", { email: "agent@example.com", subdomain: "example" }),
      ),
  },
];

describe("hand-written Basic credential composition", () => {
  for (const { provider, composed, run } of handWrittenCases) {
    it(`composes the ${provider} Basic credential from its own credential fields`, async () => {
      const calls = captureFetchCalls();

      // The stub answers every provider with the same body, so a handler may
      // reject on the payload shape afterwards. The header is already sent by
      // then, and the header is what this case pins.
      await run().catch(() => undefined);

      expect(sentAuthorization(calls)).toBe(`Basic ${Buffer.from(composed, "utf8").toString("base64")}`);
    });
  }
});

describe("hand-written Basic authorization headers", () => {
  it("encodes an echotik username and password as UTF-8 base64", async () => {
    const calls = captureFetchCalls();
    const context = customCredentialContext({ username: "echo_user", password: "密码_pässwörd" });

    const result = await echotikProxy({ method: "GET", endpoint: "/echotik/category/l1" }, context);

    expect(result.ok).toBe(true);
    expect(sentAuthorization(calls)).toBe(`Basic ${Buffer.from("echo_user:密码_pässwörd", "utf8").toString("base64")}`);
  });
});
