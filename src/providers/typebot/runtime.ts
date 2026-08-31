import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext, ProviderRuntimeHandler } from "../provider-runtime.ts";

import {
  optionalBoolean,
  optionalInteger,
  optionalNumber,
  optionalRecord,
  optionalString,
  requiredString,
} from "../../core/cast.ts";
import { queryParams } from "../../core/request.ts";
import {
  createProviderTimeout,
  ProviderRequestError,
  providerUserAgent,
  readProviderJsonBody,
} from "../provider-runtime.ts";

export const typebotApiBaseUrl = "https://app.typebot.com/api";
const validationPath = "/v1/workspaces";

const get =
  (
    path: (input: Record<string, unknown>) => string,
    query?: (input: Record<string, unknown>) => Record<string, string>,
  ): ProviderRuntimeHandler<ApiKeyProviderContext> =>
  (input, context) =>
    requestTypebot(path(input), query?.(input), context, "execute");

export const typebotActionHandlers: ProviderActionHandlers<"typebot", ProviderRuntimeHandler<ApiKeyProviderContext>> = {
  list_workspaces: get(() => validationPath),
  get_workspace: get(
    (input) => `/v1/workspaces/${encodeURIComponent(requiredString(input.workspaceId, "workspaceId"))}`,
  ),
  list_typebots: get(
    () => "/v1/typebots",
    (input) =>
      queryParams({
        workspaceId: requiredString(input.workspaceId, "workspaceId"),
        folderId: optionalString(input.folderId),
      }),
  ),
  get_typebot: get(
    (input) => `/v1/typebots/${encodeURIComponent(requiredString(input.typebotId, "typebotId"))}`,
    (input) => queryParams({ migrateToLatestVersion: optionalBoolean(input.migrateToLatestVersion) }),
  ),
  list_results: get(
    (input) => `/v1/typebots/${encodeURIComponent(requiredString(input.typebotId, "typebotId"))}/results`,
    (input) =>
      queryParams({
        limit: optionalInteger(input.limit),
        cursor: optionalNumber(input.cursor),
        timeFilter: optionalString(input.timeFilter),
        timeZone: optionalString(input.timeZone),
      }),
  ),
  get_result: get((input) => {
    const typebotId = encodeURIComponent(requiredString(input.typebotId, "typebotId"));
    const resultId = encodeURIComponent(requiredString(input.resultId, "resultId"));
    return `/v1/typebots/${typebotId}/results/${resultId}`;
  }),
};

export async function validateTypebotCredential(
  apiKey: string,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const payload = await requestTypebot(validationPath, undefined, { apiKey, fetcher, signal }, "validate");
  const workspaces = optionalRecord(payload)?.workspaces;
  const count = Array.isArray(workspaces) ? workspaces.length : 0;
  return {
    profile: { displayName: count === 1 ? "Typebot Workspace" : `Typebot (${count} workspaces)` },
    grantedScopes: [],
    metadata: { apiBaseUrl: typebotApiBaseUrl, validationEndpoint: validationPath, workspaceCount: count },
  };
}

async function requestTypebot(
  path: string,
  query: Record<string, string> | undefined,
  context: ApiKeyProviderContext,
  phase: "validate" | "execute",
): Promise<Record<string, unknown>> {
  const url = new URL(`${typebotApiBaseUrl}${path}`);
  for (const [name, value] of Object.entries(query ?? {})) url.searchParams.set(name, value);
  const timeout = createProviderTimeout(context.signal);
  try {
    const response = await context.fetcher(url, {
      headers: {
        accept: "application/json",
        authorization: `Bearer ${context.apiKey}`,
        "user-agent": providerUserAgent,
      },
      signal: timeout.signal,
    });
    const payload = await readProviderJsonBody(response, {
      emptyBody: null,
      invalidJsonMessage: "typebot returned invalid JSON",
      invalidJsonFallback: response.ok ? undefined : (text) => ({ message: text }),
    });
    if (!response.ok) throw typebotError(response, payload, phase);
    const object = optionalRecord(payload);
    if (!object) throw new ProviderRequestError(502, "typebot returned a non-object response");
    return object;
  } catch (error) {
    if (error instanceof ProviderRequestError) throw error;
    if (timeout.didTimeout()) throw new ProviderRequestError(504, "typebot request timed out");
    throw new ProviderRequestError(502, "typebot request failed");
  } finally {
    timeout.cleanup();
  }
}

function typebotError(response: Response, payload: unknown, phase: "validate" | "execute"): ProviderRequestError {
  const body = optionalRecord(payload);
  const message =
    optionalString(body?.message) ?? optionalString(body?.error) ?? (response.statusText || "typebot request failed");
  if (response.status === 429) return new ProviderRequestError(429, message);
  if (response.status === 401 || response.status === 403) {
    return new ProviderRequestError(phase === "validate" ? 400 : response.status, message);
  }
  if ([400, 404, 422].includes(response.status)) return new ProviderRequestError(400, message);
  return new ProviderRequestError(response.status >= 500 ? 502 : response.status, message);
}
