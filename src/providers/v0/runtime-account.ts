import type { CredentialValidationResult } from "../../core/types.ts";
import type { V0ActionInput } from "./runtime-client.ts";

import { compactObject } from "../../core/cast.ts";
import {
  normalizeBilling,
  normalizeListData,
  normalizePagination,
  normalizePlan,
  normalizeRateLimit,
  normalizeScope,
  normalizeUsageEvent,
  normalizeUsageMeta,
  normalizeUser,
  optionalInputNumber,
  optionalInputString,
  requestV0Json,
  toQueryString,
} from "./runtime-client.ts";

export async function validateV0Credential(
  input: { apiKey: string },
  fetcher: typeof fetch,
): Promise<CredentialValidationResult> {
  const user = await getV0CurrentUser(input.apiKey, fetcher);

  return {
    profile: {
      accountId: String(user.id),
      displayName: String(user.name ?? user.email ?? user.id),
    },
    metadata: {
      validationEndpoint: "/v1/user",
      ...user,
    },
  };
}

export async function v0GetUser(input: V0ActionInput, fetcher: typeof fetch): Promise<unknown> {
  const user = await getV0CurrentUser(input.apiKey, fetcher);
  return { user };
}

export async function v0FindRateLimit(input: V0ActionInput, fetcher: typeof fetch): Promise<unknown> {
  const payload = await requestV0Json<Record<string, unknown>>({
    path: "/v1/rate-limits",
    apiKey: input.apiKey,
    fetcher,
    mode: "execute",
    query: compactObject({
      scope: optionalInputString(input.input.scope),
    }),
  });

  return {
    rateLimit: normalizeRateLimit(payload),
  };
}

export async function v0GetBilling(input: V0ActionInput, fetcher: typeof fetch): Promise<unknown> {
  const payload = await requestV0Json<Record<string, unknown>>({
    path: "/v1/user/billing",
    apiKey: input.apiKey,
    fetcher,
    mode: "execute",
    query: compactObject({
      scope: optionalInputString(input.input.scope),
    }),
  });

  return {
    billing: normalizeBilling(payload),
  };
}

export async function v0GetPlan(input: V0ActionInput, fetcher: typeof fetch): Promise<unknown> {
  const payload = await requestV0Json<Record<string, unknown>>({
    path: "/v1/user/plan",
    apiKey: input.apiKey,
    fetcher,
    mode: "execute",
  });

  return {
    plan: normalizePlan(payload),
  };
}

export async function v0GetUserScopes(input: V0ActionInput, fetcher: typeof fetch): Promise<unknown> {
  const payload = await requestV0Json<Record<string, unknown>>({
    path: "/v1/user/scopes",
    apiKey: input.apiKey,
    fetcher,
    mode: "execute",
  });

  return {
    scopes: normalizeListData(payload).map((scope) => normalizeScope(scope)),
  };
}

export async function v0GetUsageReport(input: V0ActionInput, fetcher: typeof fetch): Promise<unknown> {
  const payload = await requestV0Json<Record<string, unknown>>({
    path: "/v1/reports/usage",
    apiKey: input.apiKey,
    fetcher,
    mode: "execute",
    query: compactObject({
      chatId: optionalInputString(input.input.chatId),
      userId: optionalInputString(input.input.userId),
      messageId: optionalInputString(input.input.messageId),
      startDate: optionalInputString(input.input.startDate),
      endDate: optionalInputString(input.input.endDate),
      limit: toQueryString(optionalInputNumber(input.input.limit)),
      cursor: optionalInputString(input.input.cursor),
    }),
  });

  return compactObject({
    usageEvents: normalizeListData(payload).map((event) => normalizeUsageEvent(event)),
    pagination: normalizePagination(payload),
    meta: normalizeUsageMeta(payload),
  });
}

async function getV0CurrentUser(apiKey: string, fetcher: typeof fetch) {
  const payload = await requestV0Json<Record<string, unknown>>({
    path: "/v1/user",
    apiKey,
    fetcher,
    mode: "validate",
  });

  return normalizeUser(payload);
}
