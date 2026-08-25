import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { compactObject, optionalRecord, optionalString } from "../../core/cast.ts";
import { ProviderRequestError, providerUserAgent } from "../provider-runtime.ts";

const tallyApiBaseUrl = "https://api.tally.so";

type TallyActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

export const tallyActionHandlers: ProviderActionHandlers<"tally", TallyActionHandler> = {
  list_forms(input, context) {
    return requestTally(context, buildListFormsUrl(input));
  },
  get_form(input, context) {
    return requestTally(context, `/forms/${encodeURIComponent(String(input.formId))}`);
  },
  list_submissions(input, context) {
    return requestTally(context, buildListSubmissionsUrl(input));
  },
  get_submission(input, context) {
    return requestTally(
      context,
      `/forms/${encodeURIComponent(String(input.formId))}/submissions/${encodeURIComponent(String(input.submissionId))}`,
    );
  },
};

export async function validateTallyCredential(
  input: { apiKey: string },
  options: { fetcher: typeof fetch; signal?: AbortSignal },
): Promise<CredentialValidationResult> {
  const payload = await requestTally(
    { apiKey: input.apiKey, fetcher: options.fetcher, signal: options.signal },
    "/users/me",
    "validate",
  );
  const record = optionalRecord(payload) ?? {};
  const email = optionalString(record.email);
  const userId = optionalString(record.id);
  const label = optionalString(record.fullName) ?? email ?? "Tally API Key";
  return {
    profile: {
      accountId: userId ?? email ?? "tally-api-key",
      displayName: label,
    },
    grantedScopes: [],
    metadata: compactObject({
      apiBaseUrl: tallyApiBaseUrl,
      validationEndpoint: "/users/me",
      userId,
      email,
      organizationId: optionalString(record.organizationId),
      subscriptionPlan: optionalString(record.subscriptionPlan),
    }),
  };
}

function buildListFormsUrl(input: Record<string, unknown>): URL {
  const url = new URL("/forms", tallyApiBaseUrl);
  appendPaging(url, input);
  if (Array.isArray(input.workspaceIds)) {
    for (const workspaceId of input.workspaceIds) {
      url.searchParams.append("workspaceIds", String(workspaceId));
    }
  }
  return url;
}

function buildListSubmissionsUrl(input: Record<string, unknown>): URL {
  const url = new URL(`/forms/${encodeURIComponent(String(input.formId))}/submissions`, tallyApiBaseUrl);
  appendPaging(url, input);
  for (const key of ["filter", "startDate", "endDate", "afterId"] as const) {
    const value = input[key];
    if (typeof value === "string" && value.length > 0) url.searchParams.set(key, value);
  }
  return url;
}

function appendPaging(url: URL, input: Record<string, unknown>): void {
  for (const key of ["page", "limit"] as const) {
    const value = input[key];
    if (typeof value === "number") url.searchParams.set(key, String(value));
  }
}

async function requestTally(
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">,
  pathOrUrl: string | URL,
  phase: "validate" | "execute" = "execute",
): Promise<unknown> {
  const url =
    pathOrUrl instanceof URL
      ? pathOrUrl
      : new URL(pathOrUrl.startsWith("/") ? pathOrUrl : `/${pathOrUrl}`, tallyApiBaseUrl);
  let response: Response;
  try {
    response = await context.fetcher(url.toString(), {
      method: "GET",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${context.apiKey}`,
        "user-agent": providerUserAgent,
      },
      signal: context.signal,
    });
  } catch (error) {
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Tally request failed: ${error.message}` : "Tally request failed",
      error,
    );
  }
  if (!response.ok) {
    throw mapTallyError(response.status, await readTallyError(response), phase);
  }
  return readTallyJson(response, "invalid Tally response");
}

async function readTallyJson(response: Response, message: string): Promise<unknown> {
  try {
    return (await response.json()) as unknown;
  } catch {
    throw new ProviderRequestError(502, message);
  }
}

async function readTallyError(response: Response): Promise<string> {
  try {
    const payload = optionalRecord(await response.json());
    return (
      optionalString(payload?.message) ??
      optionalString(payload?.error) ??
      `Tally request failed with status ${response.status}`
    );
  } catch {
    return `Tally request failed with status ${response.status}`;
  }
}

function mapTallyError(status: number, message: string, phase: "validate" | "execute"): ProviderRequestError {
  if (status === 429) return new ProviderRequestError(429, message);
  if (phase === "validate" && (status === 401 || status === 403)) return new ProviderRequestError(400, message);
  if (phase === "execute" && (status === 401 || status === 403)) return new ProviderRequestError(status, message);
  if (status === 400 || status === 404 || status === 422) return new ProviderRequestError(status, message);
  return new ProviderRequestError(status || 502, message);
}
