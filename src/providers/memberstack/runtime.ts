import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import {
  compactObject,
  optionalBoolean,
  optionalNumber,
  optionalRecord,
  optionalString,
  requiredString,
} from "../../core/cast.ts";
import {
  ProviderRequestError,
  providerUserAgent,
  requiredInputString,
  runProviderRequest,
} from "../provider-runtime.ts";

const memberstackApiBaseUrl = "https://admin.memberstack.com";

type MemberstackPhase = "validate" | "execute";
type MemberstackActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

export const memberstackActionHandlers: ProviderActionHandlers<"memberstack", MemberstackActionHandler> = {
  list_members(input, context) {
    const first = readOptionalNumberString(input.first);
    return requestMemberstackJson({
      context,
      path: "/members",
      method: "GET",
      params: compactObject({
        after: readOptionalNumberString(input.after),
        order: optionalString(input.order),
        first,
        limit: first === undefined ? readOptionalNumberString(input.limit) : undefined,
        includeJSON: readOptionalBooleanString(input.includeJSON),
      }),
      phase: "execute",
    });
  },
  get_member(input, context) {
    const idOrEmail = requiredInputString(input.idOrEmail, "idOrEmail");
    return requestMemberstackJson({
      context,
      path: `/members/${encodeURIComponent(idOrEmail)}`,
      method: "GET",
      params: compactObject({
        include: optionalBoolean(input.includeTeams) ? "teams" : undefined,
      }),
      phase: "execute",
    });
  },
  create_member(input, context) {
    return requestMemberstackJson({
      context,
      path: "/members",
      method: "POST",
      body: compactObject({
        email: requiredInputString(input.email, "email"),
        password: optionalString(input.password),
        plans: input.plans,
        customFields: input.customFields,
        metaData: input.metaData,
        json: input.json,
        loginRedirect: optionalString(input.loginRedirect),
      }),
      phase: "execute",
    });
  },
  update_member(input, context) {
    return requestMemberstackJson({
      context,
      path: `/members/${encodeURIComponent(requiredInputString(input.id, "id"))}`,
      method: "PATCH",
      body: compactObject({
        email: optionalString(input.email),
        customFields: input.customFields,
        metaData: input.metaData,
        json: input.json,
        loginRedirect: optionalString(input.loginRedirect),
        verified: optionalBoolean(input.verified),
        profileImage: optionalString(input.profileImage),
      }),
      phase: "execute",
    });
  },
  delete_member(input, context) {
    return requestMemberstackJson({
      context,
      path: `/members/${encodeURIComponent(requiredInputString(input.id, "id"))}`,
      method: "DELETE",
      body: compactObject({
        deleteStripeCustomer: optionalBoolean(input.deleteStripeCustomer),
        cancelStripeSubscriptions: optionalBoolean(input.cancelStripeSubscriptions),
      }),
      phase: "execute",
    });
  },
  add_free_plan(input, context) {
    return requestMemberstackJson({
      context,
      path: `/members/${encodeURIComponent(requiredInputString(input.id, "id"))}/add-plan`,
      method: "POST",
      body: {
        planId: requiredInputString(input.planId, "planId"),
      },
      emptySuccess: true,
      phase: "execute",
    });
  },
  remove_free_plan(input, context) {
    return requestMemberstackJson({
      context,
      path: `/members/${encodeURIComponent(requiredInputString(input.id, "id"))}/remove-plan`,
      method: "POST",
      body: {
        planId: requiredInputString(input.planId, "planId"),
      },
      emptySuccess: true,
      phase: "execute",
    });
  },
  verify_member_token(input, context) {
    return requestMemberstackJson({
      context,
      path: "/members/verify-token",
      method: "POST",
      body: {
        token: requiredInputString(input.token, "token"),
      },
      phase: "execute",
    });
  },
};

export async function validateMemberstackCredential(
  apiKey: string,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const payload = await requestMemberstackJson({
    context: { apiKey, fetcher, signal },
    path: "/members",
    method: "GET",
    params: {
      limit: "1",
    },
    phase: "validate",
  });

  return {
    profile: {
      accountId: "memberstack:secret-key",
      displayName: "Memberstack Secret Key",
    },
    grantedScopes: [],
    metadata: compactObject({
      apiBaseUrl: memberstackApiBaseUrl,
      validationEndpoint: "/members",
      totalCount: optionalNumber(payload.totalCount),
    }),
  };
}

async function requestMemberstackJson(input: {
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">;
  path: string;
  method: "DELETE" | "GET" | "PATCH" | "POST";
  params?: Record<string, string | undefined>;
  body?: Record<string, unknown>;
  emptySuccess?: boolean;
  phase: MemberstackPhase;
}): Promise<Record<string, unknown>> {
  return runProviderRequest({ signal: input.context.signal, label: "Memberstack" }, async (signal) => {
    const body = input.body && Object.keys(input.body).length > 0 ? input.body : undefined;
    const headers: Record<string, string> = {
      accept: "application/json",
      "user-agent": providerUserAgent,
      "x-api-key": input.context.apiKey,
    };
    if (body) {
      headers["content-type"] = "application/json";
    }

    const response = await input.context.fetcher(buildMemberstackUrl(input.path, input.params ?? {}), {
      method: input.method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      signal,
    });
    const payload = await readMemberstackPayload(response);

    if (!response.ok) {
      throw createMemberstackError(response.status, payload, input.phase);
    }

    if (input.emptySuccess) {
      return { success: true };
    }

    const payloadRecord = optionalRecord(payload);
    if (!payloadRecord) {
      throw new ProviderRequestError(502, "Memberstack returned an invalid payload");
    }
    return payloadRecord;
  });
}

function buildMemberstackUrl(path: string, params: Record<string, string | undefined>): URL {
  const normalizedPath = path.startsWith("/") ? path.slice(1) : path;
  const url = new URL(normalizedPath, `${memberstackApiBaseUrl}/`);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) {
      url.searchParams.set(key, value);
    }
  }
  return url;
}

async function readMemberstackPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (text.trim() === "") {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "Memberstack returned invalid JSON");
  }
}

function createMemberstackError(status: number, payload: unknown, phase: MemberstackPhase): ProviderRequestError {
  const message = extractMemberstackErrorMessage(payload) ?? `Memberstack request failed with ${status}`;

  if (status === 429) {
    return new ProviderRequestError(429, message);
  }

  if (phase === "validate" && status >= 400 && status < 500) {
    return new ProviderRequestError(400, message);
  }

  if (phase === "execute" && status === 401) {
    return new ProviderRequestError(401, message);
  }

  if (phase === "execute" && status >= 400 && status < 500) {
    return new ProviderRequestError(status, message);
  }

  return new ProviderRequestError(status || 500, message);
}

function extractMemberstackErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim() !== "") {
    return payload;
  }

  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }

  return optionalString(record.message) ?? optionalString(record.code) ?? optionalString(record.error);
}

function readOptionalBooleanString(value: unknown): string | undefined {
  const parsed = optionalBoolean(value);
  return parsed === undefined ? undefined : String(parsed);
}

function readOptionalNumberString(value: unknown): string | undefined {
  const parsed = optionalNumber(value);
  return parsed === undefined ? undefined : String(parsed);
}
