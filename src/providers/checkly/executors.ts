import type { CredentialValidators, ExecutionContext, ProviderExecutors } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";

import { optionalBoolean, optionalRecord, optionalString, requiredRecord, requiredString } from "../../core/cast.ts";
import {
  defineProviderExecutors,
  isAbortLikeError,
  providerUserAgent,
  ProviderRequestError,
  requireApiKeyCredential,
} from "../provider-runtime.ts";

const service = "checkly";
const apiBaseUrl = "https://api.checklyhq.com";
const requestTimeoutMs = 30_000;

type ChecklyPhase = "validate" | "execute";

interface ChecklyContext {
  apiKey: string;
  accountId: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

type ChecklyHandler = (input: Record<string, unknown>, context: ChecklyContext) => Promise<unknown>;

export const checklyActionHandlers: ProviderActionHandlers<"checkly", ChecklyHandler> = {
  async get_current_account(_input, context) {
    return { account: await requestChecklyJson({ context, path: "/v1/accounts/me", phase: "execute" }) };
  },
  async list_checks(input, context) {
    const checks = await requestChecklyJson({
      context,
      path: "/v1/checks",
      phase: "execute",
      query: buildQuery(input, [
        "limit",
        "page",
        "apiCheckUrlFilterPattern",
        "tag",
        "checkType",
        "search",
        "status",
        "applyGroupSettings",
      ]),
    });
    return { checks: requireArray(checks, "checkly checks response") };
  },
  async get_check(input, context) {
    const checkId = requiredString(input.checkId, "checkId");
    return {
      check: await requestChecklyJson({
        context,
        path: `/v1/checks/${encodeURIComponent(checkId)}`,
        phase: "execute",
        query: buildQuery(input, ["includeDependencies", "applyGroupSettings"]),
      }),
    };
  },
  async list_check_statuses(_input, context) {
    const statuses = await requestChecklyJson({ context, path: "/v1/check-statuses", phase: "execute" });
    return { statuses: requireArray(statuses, "checkly check statuses response") };
  },
  async get_check_status(input, context) {
    const checkId = requiredString(input.checkId, "checkId");
    return {
      status: requiredRecord(
        await requestChecklyJson({
          context,
          path: `/v1/check-statuses/${encodeURIComponent(checkId)}`,
          phase: "execute",
        }),
        "checkly check status response",
        providerError,
      ),
    };
  },
  async list_check_results(input, context) {
    const checkId = requiredString(input.checkId, "checkId");
    const results = await requestChecklyJson({
      context,
      path: `/v1/check-results/${encodeURIComponent(checkId)}`,
      phase: "execute",
      query: buildQuery(input, ["limit", "page", "from", "to", "location", "checkType", "hasFailures", "resultType"]),
    });
    return { results: requireArray(results, "checkly check results response") };
  },
  async get_check_result(input, context) {
    const checkId = requiredString(input.checkId, "checkId");
    const checkResultId = requiredString(input.checkResultId, "checkResultId");
    return {
      result: requiredRecord(
        await requestChecklyJson({
          context,
          path: `/v1/check-results/${encodeURIComponent(checkId)}/${encodeURIComponent(checkResultId)}`,
          phase: "execute",
        }),
        "checkly check result response",
        providerError,
      ),
    };
  },
};

export const executors: ProviderExecutors = defineProviderExecutors<ChecklyContext>({
  service,
  handlers: checklyActionHandlers,
  async createContext(context: ExecutionContext, fetcher: typeof fetch): Promise<ChecklyContext> {
    const credential = await requireApiKeyCredential(context, service);
    return {
      apiKey: credential.apiKey,
      accountId: resolveAccountId(credential.values.accountId ?? credential.metadata.accountId),
      fetcher,
      signal: context.signal,
    };
  },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const context = {
      apiKey: input.apiKey,
      accountId: resolveAccountId(input.values.accountId),
      fetcher,
      signal,
    };
    const account = requiredRecord(
      await requestChecklyJson({ context, path: "/v1/accounts/me", phase: "validate" }),
      "checkly account response",
      providerError,
    );
    const accountId = optionalString(account.id) ?? context.accountId;

    return {
      profile: {
        accountId,
        displayName: optionalString(account.name) ?? `Checkly ${accountId}`,
      },
      grantedScopes: [],
      metadata: {
        accountId: context.accountId,
        apiBaseUrl,
        validationEndpoint: "/v1/accounts/me",
        accountName: optionalString(account.name),
        plan: optionalString(account.plan),
        planDisplayName: optionalString(account.planDisplayName),
      },
    };
  },
};

async function requestChecklyJson(input: {
  context: ChecklyContext;
  path: string;
  phase: ChecklyPhase;
  query?: URLSearchParams;
}): Promise<unknown> {
  const signal = input.context.signal
    ? AbortSignal.any([input.context.signal, AbortSignal.timeout(requestTimeoutMs)])
    : AbortSignal.timeout(requestTimeoutMs);
  let response: Response;
  let payload: unknown;
  try {
    response = await input.context.fetcher(buildUrl(input.path, input.query), {
      method: "GET",
      headers: {
        authorization: `Bearer ${input.context.apiKey}`,
        "x-checkly-account": input.context.accountId,
        accept: "application/json",
        "user-agent": providerUserAgent,
      },
      signal,
    });
    payload = await readJson(response);
  } catch (error) {
    if (error instanceof ProviderRequestError) throw error;
    if (isAbortLikeError(error)) throw new ProviderRequestError(504, "checkly request timed out");
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `checkly request failed: ${error.message}` : "checkly request failed",
    );
  }
  if (!response.ok) throw createError(response, payload, input.phase);
  return payload;
}

function buildUrl(path: string, query?: URLSearchParams): URL {
  const url = new URL(path.startsWith("/") ? path.slice(1) : path, `${apiBaseUrl}/`);
  if (query) url.search = query.toString();
  return url;
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return undefined;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "checkly returned invalid JSON");
  }
}

function createError(response: Response, payload: unknown, phase: ChecklyPhase): ProviderRequestError {
  const message = readErrorMessage(payload) ?? `checkly request failed with status ${response.status}`;
  if (response.status === 429) return new ProviderRequestError(429, message, payload);
  if (response.status >= 500) return new ProviderRequestError(502, message, payload);
  if (phase === "validate" && (response.status === 401 || response.status === 403)) {
    return new ProviderRequestError(response.status, message, payload);
  }
  if (response.status >= 400 && response.status < 500)
    return new ProviderRequestError(response.status, message, payload);
  return new ProviderRequestError(response.status, message, payload);
}

function readErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload) return payload;
  const record = optionalRecord(payload);
  const directMessage = optionalString(record?.message) ?? optionalString(record?.error);
  if (directMessage) return directMessage;
  const errors = record?.errors;
  return Array.isArray(errors) ? errors.find((item): item is string => typeof item === "string") : undefined;
}

function buildQuery(input: Record<string, unknown>, allowedKeys: string[]): URLSearchParams {
  const query = new URLSearchParams();
  for (const key of allowedKeys) {
    const value = input[key];
    if (value == null || value === "") continue;
    if (typeof value === "boolean") {
      appendQueryValue(query, key, optionalBoolean(value));
    } else if (Array.isArray(value)) {
      for (const item of value) {
        if (item != null && item !== "") query.append(key, String(item));
      }
    } else {
      query.append(key, String(value));
    }
  }
  return query;
}

function appendQueryValue(query: URLSearchParams, key: string, value: unknown): void {
  if (value !== undefined) query.append(key, String(value));
}

function requireArray(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) throw new ProviderRequestError(502, `${label} is not an array`);
  return value;
}

function resolveAccountId(value: unknown): string {
  const accountId = optionalString(value);
  if (!accountId) throw new ProviderRequestError(400, "checkly accountId is required");
  return accountId;
}

function providerError(message: string): ProviderRequestError {
  return new ProviderRequestError(502, message);
}
