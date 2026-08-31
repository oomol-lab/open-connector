import type { ApiKeyActionRequest, ProviderActionHandlers } from "../provider-runtime.ts";
import type { VidaActionName } from "./actions.ts";

import { compactObject, optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import {
  createProviderTimeout,
  isAbortLikeError,
  ProviderRequestError,
  providerUserAgent,
} from "../provider-runtime.ts";

export interface VidaCredentialCheck {
  providerAccountId?: string;
  accountLabel: string;
  providerScopes: string[];
  providerMetadata: Record<string, unknown>;
}

export const vidaApiBaseUrl = "https://api.vida.dev";

type VidaPhase = "validate" | "execute";
type VidaActionHandler = (input: Record<string, unknown>, fetcher: typeof fetch, apiKey: string) => Promise<unknown>;

export const vidaActionHandlers: ProviderActionHandlers<"vida", VidaActionHandler> = {
  get_account(input, fetcher, apiKey) {
    return requestVidaJson({
      path: "/api/v2/account",
      apiKey,
      params: buildTargetAccountParams(input),
      fetcher,
      phase: "execute",
    });
  },
  list_tasks(input, fetcher, apiKey) {
    return requestVidaJson({
      path: "/api/v2/tasks",
      apiKey,
      params: compactObject({
        limit: readOptionalNumberString(input.limit),
        offset: readOptionalNumberString(input.offset),
        since: readOptionalNumberString(input.since),
        until: readOptionalNumberString(input.until),
        sort: readOptionalString(input.sort),
        order: readOptionalString(input.order),
        externalTaskId: readOptionalString(input.externalTaskId),
        targetAccountId: readOptionalNumberString(input.targetAccountId),
      }),
      fetcher,
      phase: "execute",
    });
  },
  get_task(input, fetcher, apiKey) {
    return requestVidaJson({
      path: `/api/v2/tasks/${encodeURIComponent(readRequiredString(input.taskId, "taskId"))}`,
      apiKey,
      params: buildTargetAccountParams(input),
      fetcher,
      phase: "execute",
    });
  },
  get_task_statistics(input, fetcher, apiKey) {
    return requestVidaJson({
      path: "/api/v2/tasks/stats",
      apiKey,
      params: buildTargetAccountParams(input),
      fetcher,
      phase: "execute",
    });
  },
  get_daily_counts(input, fetcher, apiKey) {
    return requestVidaJson({
      path: "/api/v2/tasks/dailyCounts",
      apiKey,
      params: buildTargetAccountParams(input),
      fetcher,
      phase: "execute",
    });
  },
};

export async function validateVidaCredential(
  input: Record<string, string>,
  fetcher: typeof fetch,
): Promise<VidaCredentialCheck> {
  const payload = await requestVidaJson({
    path: "/api/v2/account",
    apiKey: requiredString(input.apiKey, "apiKey", (message) => new ProviderRequestError(400, message)),
    params: {},
    fetcher,
    phase: "validate",
  });
  const account = optionalRecord(payload);
  const accountLabel =
    readAccountLabel(account) ?? (account?.id !== undefined ? `Vida Account ${String(account.id)}` : "Vida API Token");

  return {
    accountLabel,
    providerScopes: [],
    providerMetadata: compactObject({
      validationEndpoint: "/api/v2/account",
      accountId: typeof account?.id === "string" || typeof account?.id === "number" ? account.id : undefined,
    }),
  };
}

export async function executeVidaAction(
  input: ApiKeyActionRequest & {
    actionName: VidaActionName;
    input: Record<string, unknown>;
  },
  fetcher: typeof fetch,
): Promise<unknown> {
  const handler = vidaActionHandlers[input.actionName];
  if (!handler) {
    throw new ProviderRequestError(500, `vida action is not implemented yet: ${input.actionName}`);
  }

  return handler(
    input.input,
    fetcher,
    requiredString(input.apiKey, "apiKey", (message) => new ProviderRequestError(400, message)),
  );
}

function buildTargetAccountParams(input: Record<string, unknown>) {
  return compactObject({
    targetAccountId: readOptionalNumberString(input.targetAccountId),
  });
}

async function requestVidaJson(input: {
  path: string;
  apiKey: string;
  params: Record<string, string | undefined>;
  fetcher: typeof fetch;
  phase: VidaPhase;
}) {
  const timeoutHandle = createProviderTimeout(undefined);

  try {
    const response = await input.fetcher(buildVidaUrl(input.path, input.apiKey, input.params), {
      method: "GET",
      headers: {
        accept: "application/json",
        "user-agent": providerUserAgent,
      },
      signal: timeoutHandle.signal,
    });
    const payload = await readVidaPayload(response, { strictJson: response.ok });

    if (!response.ok) {
      throw createVidaError(response.status, payload, input.phase);
    }

    return payload;
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }

    if (timeoutHandle.didTimeout() || isAbortLikeError(error)) {
      throw new ProviderRequestError(504, "Vida request timed out");
    }

    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Vida request failed: ${error.message}` : "Vida request failed",
    );
  } finally {
    timeoutHandle.cleanup();
  }
}

function buildVidaUrl(path: string, apiKey: string, params: Record<string, string | undefined>) {
  const url = new URL(path, vidaApiBaseUrl);
  url.searchParams.set("token", apiKey);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) {
      url.searchParams.set(key, value);
    }
  }
  return url;
}

async function readVidaPayload(response: Response, options: { strictJson: boolean }) {
  const text = await response.text();
  if (text.trim() === "") {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    if (!options.strictJson) {
      return text;
    }
    throw new ProviderRequestError(502, "Vida returned invalid JSON");
  }
}

function createVidaError(status: number, payload: unknown, phase: VidaPhase) {
  const message = extractVidaErrorMessage(payload) ?? `Vida request failed with status ${status}`;

  if (status === 429) {
    return new ProviderRequestError(429, message);
  }
  if (phase === "validate" && status >= 400 && status < 500) {
    return new ProviderRequestError(400, message);
  }
  if (phase === "execute" && (status === 401 || status === 403)) {
    return new ProviderRequestError(status, message);
  }
  if (phase === "execute" && status >= 400 && status < 500) {
    return new ProviderRequestError(status, message);
  }
  return new ProviderRequestError(status || 500, message);
}

function extractVidaErrorMessage(payload: unknown) {
  if (typeof payload === "string" && payload.trim() !== "") {
    return payload;
  }
  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }
  return (
    optionalString(record.message)?.trim() ??
    optionalString(record.error)?.trim() ??
    optionalString(record.detail)?.trim()
  );
}

function readAccountLabel(account: Record<string, unknown> | undefined) {
  const details = optionalRecord(account?.details);
  return (
    optionalString(details?.accountName)?.trim() ||
    optionalString(details?.businessName)?.trim() ||
    optionalString(details?.orgName)?.trim() ||
    optionalString(details?.name)?.trim() ||
    optionalString(account?.username)?.trim() ||
    undefined
  );
}

function readRequiredString(value: unknown, fieldName: string) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new ProviderRequestError(400, `${fieldName} must be a non-empty string`);
  }
  return value.trim();
}

function readOptionalString(value: unknown) {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;
}

function readOptionalNumberString(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? String(value) : undefined;
}
