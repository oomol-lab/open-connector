import type {
  CredentialValidators,
  ExecutionContext,
  ExecutionResult,
  ProviderExecutors,
  ProviderProxyExecutor,
  ResolvedCredential,
} from "../core/types.ts";

import { afterEach, describe, expect, it, vi } from "vitest";
import { serializeRuntimeActionResult } from "../server/api/runtime-api.ts";
import {
  credentialValidators as clinicalkeyValidators,
  executors as clinicalkeyExecutors,
} from "./clinicalkey/executors.ts";
import { executors as deepgramExecutors } from "./deepgram/executors.ts";
import { credentialValidators as dovetailValidators } from "./dovetail/executors.ts";
import { executors as figmaExecutors } from "./figma/executors.ts";
import { executors as helpdeskExecutors } from "./helpdesk/executors.ts";
import { executors as mondayExecutors } from "./monday/executors.ts";
import { ProviderRequestError, toProviderExecutionError } from "./provider-runtime.ts";
import {
  credentialValidators as roxyapiValidators,
  executors as roxyapiExecutors,
  proxy as roxyapiProxy,
} from "./roxyapi/executors.ts";
import { executors as sellerspriteExecutors } from "./sellersprite/executors.ts";
import { executors as teableExecutors } from "./teable/executors.ts";
import { assertTikHubEndpointEligible } from "./tikhub/endpoint-policy.ts";
import { proxy as walmartMarketplaceProxy } from "./walmart_marketplace/executors.ts";
import { proxy as youzanProxy } from "./youzan/executors.ts";
import { executors as zoomExecutors } from "./zoom/executors.ts";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

interface AuthFailureCase {
  service: string;
  executors: ProviderExecutors;
  actionId: `${string}.${string}`;
  credential: ResolvedCredential;
}

const apiKeyCredential: ResolvedCredential = {
  authType: "api_key",
  apiKey: "test-key",
  values: { accountId: "account-1", requestorId: "requestor-1", customerId: "customer-1" },
  profile: { accountId: "acct", displayName: "Test", grantedScopes: [] },
  metadata: {},
};

const oauthCredential: ResolvedCredential = {
  authType: "oauth2",
  accessToken: "expired-access-token",
  tokenType: "Bearer",
  profile: { accountId: "acct", displayName: "Test", grantedScopes: [] },
  metadata: {},
};

/** Named apart from the table so the 403 case cannot drift onto another provider. */
const clinicalkeyCase: AuthFailureCase = {
  service: "clinicalkey",
  executors: clinicalkeyExecutors,
  actionId: "clinicalkey.get_service_status",
  credential: apiKeyCredential,
};

const authFailureCases: AuthFailureCase[] = [
  clinicalkeyCase,
  {
    service: "deepgram",
    executors: deepgramExecutors,
    actionId: "deepgram.list_projects",
    credential: apiKeyCredential,
  },
  {
    service: "helpdesk",
    executors: helpdeskExecutors,
    actionId: "helpdesk.list_tickets",
    credential: apiKeyCredential,
  },
  {
    service: "sellersprite",
    executors: sellerspriteExecutors,
    actionId: "sellersprite.get_api_usage",
    credential: apiKeyCredential,
  },
  {
    service: "monday",
    executors: mondayExecutors,
    actionId: "monday.list_boards",
    credential: apiKeyCredential,
  },
  {
    service: "teable",
    executors: teableExecutors,
    actionId: "teable.list_spaces",
    credential: apiKeyCredential,
  },
];

interface ValidatePhaseCase {
  service: string;
  validators: CredentialValidators;
  input: { apiKey: string; values: Record<string, string> };
}

/**
 * The same mappers the execute-phase sweep edited also serve the connect form,
 * where an upstream 401 means the key the user just typed is wrong. That arm
 * must stay on `invalid_input` / HTTP 400 so the form marks the field instead of
 * prompting for a reconnect that would loop back to the same form. Covers both
 * shapes the sweep touched: a `phase === "validate"` guard clause (clinicalkey)
 * and a ternary status (dovetail).
 */
const validatePhaseCases: ValidatePhaseCase[] = [
  {
    service: "clinicalkey",
    validators: clinicalkeyValidators,
    input: {
      apiKey: "test-key",
      values: { accountId: "account-1", requestorId: "requestor-1", customerId: "customer-1" },
    },
  },
  { service: "dovetail", validators: dovetailValidators, input: { apiKey: "test-key", values: {} } },
];

interface ProxyAuthFailureCase {
  service: string;
  proxy: ProviderProxyExecutor;
  credential: ResolvedCredential;
}

/**
 * `/v1/proxy` reaches a provider's own error mapper only where the provider
 * issues a request of its own before the proxied one, so the sweep moves the
 * proxy route for exactly these two: youzan resolves an access token in its
 * hand-written proxy body, and walmart_marketplace exchanges one in a
 * `defineProviderProxy` `customizeRequest` hook, which runs inside the same
 * `try` as the proxied request. Both answered `invalid_input` before the sweep.
 * Every other proxy builds its error from the upstream response instead, which
 * already carried the status. The proxy route answers `authorization_failed`
 * with HTTP 403, pinned by the cross-route table in
 * `src/server/proxy/proxy-runner.test.ts`.
 */
const proxyAuthFailureCases: ProxyAuthFailureCase[] = [
  {
    service: "walmart_marketplace",
    proxy: walmartMarketplaceProxy,
    credential: {
      authType: "custom_credential",
      values: { clientId: "client-1", clientSecret: "secret-1" },
      profile: { accountId: "acct", displayName: "Test", grantedScopes: [] },
      metadata: {},
    },
  },
  {
    service: "youzan",
    proxy: youzanProxy,
    credential: {
      authType: "custom_credential",
      values: { clientId: "client-1", clientSecret: "secret-1", grantId: "12345" },
      profile: { accountId: "acct", displayName: "Test", grantedScopes: [] },
      metadata: {},
    },
  },
];

function contextFor(credential: ResolvedCredential): ExecutionContext {
  return { getCredential: async () => credential };
}

function unauthorizedUpstream(status: number): typeof fetch {
  return async () => {
    return new Response(JSON.stringify({ message: "The access token is expired." }), {
      status,
      headers: { "content-type": "application/json" },
    });
  };
}

function stubUnauthorizedUpstream(status: number): void {
  vi.stubGlobal("fetch", unauthorizedUpstream(status));
}

async function runExpiredCredential(testCase: AuthFailureCase, status: number): Promise<ExecutionResult> {
  stubUnauthorizedUpstream(status);
  const executor = testCase.executors[testCase.actionId];
  if (!executor) {
    throw new Error(`missing executor for ${testCase.actionId}`);
  }
  return executor({}, contextFor(testCase.credential));
}

function httpStatusOf(result: ExecutionResult): number {
  return serializeRuntimeActionResult({
    actionId: "example.action",
    executionId: "execution-1",
    auditPersisted: false,
    result,
  }).status;
}

describe.each(authFailureCases)("$service execute-phase credential failures", (testCase) => {
  it("reports an upstream 401 as authorization_failed with HTTP 403", async () => {
    const result = await runExpiredCredential(testCase, 401);

    expect(result).toMatchObject({ ok: false, error: { code: "authorization_failed" } });
    expect(httpStatusOf(result)).toBe(403);
  });
});

describe("clinicalkey execute-phase credential failures", () => {
  it("reports an upstream 403 as authorization_failed with HTTP 403", async () => {
    const result = await runExpiredCredential(clinicalkeyCase, 403);

    expect(result).toMatchObject({ ok: false, error: { code: "authorization_failed" } });
    expect(httpStatusOf(result)).toBe(403);
  });
});

describe.each(validatePhaseCases)("$service validate-phase credential failures", (testCase) => {
  it("keeps an upstream 401 on invalid_input with HTTP 400", async () => {
    const validateApiKey = testCase.validators.apiKey;
    if (!validateApiKey) {
      throw new Error(`missing apiKey validator for ${testCase.service}`);
    }

    let raised: unknown;
    try {
      await validateApiKey(testCase.input, { fetcher: unauthorizedUpstream(401) });
    } catch (error) {
      raised = error;
    }

    expect(raised).toBeInstanceOf(ProviderRequestError);
    expect((raised as ProviderRequestError).status).toBe(400);
    const result = toProviderExecutionError(raised, `${testCase.service} credential validation failed`);
    expect(result).toMatchObject({ ok: false, error: { code: "invalid_input" } });
    expect(httpStatusOf(result)).toBe(400);
  });
});

describe.each(proxyAuthFailureCases)("$service proxy-route credential failures", (testCase) => {
  it("reports an upstream 401 as authorization_failed", async () => {
    stubUnauthorizedUpstream(401);

    const result = await testCase.proxy({ endpoint: "/items", method: "GET" }, contextFor(testCase.credential));

    expect(result).toMatchObject({ ok: false, error: { code: "authorization_failed" } });
  });
});

describe("provider response mappers across action and proxy routes", () => {
  it("keeps RoxyAPI error-body timeouts on 504 across action, validation and proxy routes", async () => {
    vi.useFakeTimers();
    let bodyCount = 0;
    let resolveBodiesStarted: (() => void) | undefined;
    const bodiesStarted = new Promise<void>((resolve) => {
      resolveBodiesStarted = resolve;
    });
    const fetcher: typeof fetch = async (_url, init) =>
      new Response(
        new ReadableStream({
          start(controller) {
            init?.signal?.addEventListener("abort", () => controller.error(init.signal?.reason), { once: true });
            bodyCount += 1;
            if (bodyCount === 3) resolveBodiesStarted?.();
          },
        }),
        { status: 403 },
      );
    vi.stubGlobal("fetch", fetcher);
    const context = contextFor(apiKeyCredential);
    const pending = Promise.allSettled([
      roxyapiExecutors["roxyapi.get_usage"]!({}, context),
      roxyapiProxy({ endpoint: "/usage", method: "GET" }, context),
      roxyapiValidators.apiKey!({ apiKey: "sk_test", values: {} }, { fetcher }),
    ]);
    await bodiesStarted;
    await vi.advanceTimersByTimeAsync(30_000);
    const results = await pending;

    for (const result of results.slice(0, 2)) {
      expect(result).toMatchObject({
        status: "fulfilled",
        value: { ok: false, error: { code: "provider_error", details: { status: 504 } } },
      });
    }
    expect(results[2]).toMatchObject({ status: "rejected", reason: { status: 504 } });
  });

  it.each([
    [401, "subscription_inactive", "provider_error"],
    [401, "subscription_not_found", "provider_error"],
    [401, "unauthorized", "provider_error"],
    [403, "origin_not_allowed", "provider_error"],
    [403, "forbidden", "provider_error"],
    [401, "invalid_api_key", "authorization_failed"],
    [401, "api_key_revoked", "authorization_failed"],
    [400, "validation_error", "invalid_input"],
    [429, "rate_limit_per_minute", "rate_limited"],
  ])("keeps RoxyAPI %s/%s consistent across routes", async (status, upstreamCode, expectedCode) => {
    vi.stubGlobal(
      "fetch",
      async () =>
        new Response(JSON.stringify({ code: upstreamCode, error: "Upstream request denied." }), {
          status,
          headers: { "content-type": "application/json" },
        }),
    );
    const context = contextFor(apiKeyCredential);
    const action = await roxyapiExecutors["roxyapi.get_usage"]!({}, context);
    const proxy = await roxyapiProxy({ endpoint: "/usage", method: "GET" }, context);
    const expected = {
      ok: false,
      error: {
        code: expectedCode,
        message: `${upstreamCode}: Upstream request denied.`,
        details: { status, details: { upstreamCode } },
      },
    };

    expect(action).toMatchObject(expected);
    expect(proxy).toMatchObject(expected);
  });

  it.each(["invalid_api_key", "api_key_revoked"])(
    "keeps RoxyAPI %s on a connection field error during validation",
    async (upstreamCode) => {
      const fetcher: typeof fetch = async () =>
        new Response(JSON.stringify({ code: upstreamCode, error: "Key rejected." }), {
          status: 401,
          headers: { "content-type": "application/json" },
        });

      await expect(roxyapiValidators.apiKey!({ apiKey: "sk_test", values: {} }, { fetcher })).rejects.toMatchObject({
        status: 400,
        code: "invalid_input",
        message: `${upstreamCode}: Key rejected.`,
      });
    },
  );

  it.each(["", "<html>Access denied</html>", "x".repeat(65 * 1024)])(
    "keeps unreadable RoxyAPI denials on provider_error without a credential signal",
    async (body) => {
      vi.stubGlobal("fetch", async () => new Response(body, { status: 403 }));
      const result = await roxyapiProxy({ endpoint: "/usage", method: "GET" }, contextFor(apiKeyCredential));

      expect(result).toMatchObject({
        ok: false,
        error: { code: "provider_error", message: "RoxyAPI request failed with status 403", details: { status: 403 } },
      });
    },
  );
});

describe("provider-local endpoint denials", () => {
  it("reports an endpoint the provider will not serve as invalid_input with HTTP 400", () => {
    let raised: unknown;
    try {
      assertTikHubEndpointEligible("GET", "/api/v1/tikhub/user/get_user_info");
    } catch (error) {
      raised = error;
    }

    const result = toProviderExecutionError(raised, "TikHub request failed");
    expect(result).toMatchObject({ ok: false, error: { code: "invalid_input" } });
    expect(httpStatusOf(result)).toBe(400);
  });
});

it.each([401, 403])("preserves ambiguous Zoom HTTP %s errors without requesting reauthorization", async (status) => {
  const result = await runExpiredCredential(
    { service: "zoom", executors: zoomExecutors, actionId: "zoom.list_meetings", credential: oauthCredential },
    status,
  );
  expect(result).toMatchObject({ ok: false, error: { code: "provider_error" } });
});

it.each([401, 403])("preserves ambiguous Figma HTTP %s errors without requesting reauthorization", async (status) => {
  const result = await runExpiredCredential(
    { service: "figma", executors: figmaExecutors, actionId: "figma.get_current_user", credential: oauthCredential },
    status,
  );
  expect(result).toMatchObject({ ok: false, error: { code: "provider_error" } });
});
