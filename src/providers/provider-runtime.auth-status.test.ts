import type { ExecutionContext, ExecutionResult, ProviderExecutors, ResolvedCredential } from "../core/types.ts";

import { afterEach, describe, expect, it, vi } from "vitest";
import { serializeRuntimeActionResult } from "../server/api/runtime-api.ts";
import { executors as clinicalkeyExecutors } from "./clinicalkey/executors.ts";
import { executors as deepgramExecutors } from "./deepgram/executors.ts";
import { executors as helpdeskExecutors } from "./helpdesk/executors.ts";
import { executors as mondayExecutors } from "./monday/executors.ts";
import { toProviderExecutionError } from "./provider-runtime.ts";
import { executors as sellerspriteExecutors } from "./sellersprite/executors.ts";
import { executors as teableExecutors } from "./teable/executors.ts";
import { assertTikHubEndpointEligible } from "./tikhub/endpoint-policy.ts";
import { executors as zoomExecutors } from "./zoom/executors.ts";

afterEach(() => {
  vi.unstubAllGlobals();
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
  { service: "zoom", executors: zoomExecutors, actionId: "zoom.list_meetings", credential: oauthCredential },
];

function contextFor(credential: ResolvedCredential): ExecutionContext {
  return { getCredential: async () => credential };
}

function stubUnauthorizedUpstream(status: number): void {
  vi.stubGlobal("fetch", async () => {
    return new Response(JSON.stringify({ message: "The access token is expired." }), {
      status,
      headers: { "content-type": "application/json" },
    });
  });
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
