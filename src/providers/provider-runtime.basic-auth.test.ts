import type { ExecutionContext, ResolvedCredential } from "../core/types.ts";

import { Buffer } from "node:buffer";
import { afterEach, describe, expect, it, vi } from "vitest";
import { proxy as echotikProxy } from "./echotik/executors.ts";
import { defineProviderProxy } from "./provider-runtime.ts";

afterEach(() => {
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

function apiKeyContext(apiKey: string): ExecutionContext {
  const credential: ResolvedCredential = {
    authType: "api_key",
    apiKey,
    values: { apiKey },
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

describe("hand-written Basic authorization headers", () => {
  it("encodes an echotik username and password as UTF-8 base64", async () => {
    const calls = captureFetchCalls();
    const context = customCredentialContext({ username: "echo_user", password: "密码_pässwörd" });

    const result = await echotikProxy({ method: "GET", endpoint: "/echotik/category/l1" }, context);

    expect(result.ok).toBe(true);
    expect(sentAuthorization(calls)).toBe(`Basic ${Buffer.from("echo_user:密码_pässwörd", "utf8").toString("base64")}`);
  });
});
