import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { compactObject, optionalRecord, optionalString } from "../../core/cast.ts";
import {
  createProviderTimeout,
  defineApiKeyProviderExecutors,
  isAbortLikeError,
  providerUserAgent,
  ProviderRequestError,
} from "../provider-runtime.ts";

const service = "fairing";
const fairingApiBaseUrl = "https://app.fairing.co/api";
const fairingRequestTimeoutMs = 30_000;

type FairingPhase = "validate" | "execute";
type FairingActionContext = Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">;
type FairingActionHandler = (input: Record<string, unknown>, context: FairingActionContext) => Promise<unknown>;

export const fairingActionHandlers: ProviderActionHandlers<"fairing", FairingActionHandler> = {
  list_responses(input, context) {
    return listResponses(input, context);
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, fairingActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const payload = await requestFairingJson({
      context: {
        apiKey: input.apiKey,
        fetcher,
        signal,
      },
      path: "/responses",
      query: { limit: 1 },
      phase: "validate",
    });
    const responses = readResponseArray(payload);
    const firstResponse = responses[0];

    return {
      profile: {
        accountId: "api_key",
        displayName: "Fairing API Key",
      },
      grantedScopes: [],
      metadata: compactObject({
        apiBaseUrl: fairingApiBaseUrl,
        validationEndpoint: "/responses",
        sampleResponseId: optionalString(firstResponse?.id),
      }),
    };
  },
};

async function listResponses(input: Record<string, unknown>, context: FairingActionContext): Promise<unknown> {
  if (input.starting_after !== undefined && input.ending_before !== undefined) {
    throw new ProviderRequestError(400, "starting_after and ending_before are mutually exclusive.");
  }

  const payload = await requestFairingJson({
    context,
    path: "/responses",
    query: compactObject({
      starting_after: input.starting_after,
      ending_before: input.ending_before,
      inserted_at_min: input.inserted_at_min,
      inserted_at_max: input.inserted_at_max,
      updated_at_min: input.updated_at_min,
      updated_at_max: input.updated_at_max,
      sort: input.sort,
      limit: input.limit,
      question_id: input.question_id,
    }),
    phase: "execute",
  });
  const record = requireFairingRecord(payload, "invalid fairing responses payload");

  return {
    responses: readResponseArray(record),
    next: optionalString(record.next) ?? null,
    prev: optionalString(record.prev) ?? null,
  };
}

async function requestFairingJson(input: {
  context: FairingActionContext;
  path: string;
  query?: Record<string, unknown>;
  phase: FairingPhase;
}): Promise<unknown> {
  const url = new URL(`${fairingApiBaseUrl}${input.path}`);
  for (const [key, value] of Object.entries(input.query ?? {})) {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  }

  const timeout = createProviderTimeout(input.context.signal, fairingRequestTimeoutMs);
  try {
    const response = await input.context.fetcher(url, {
      method: "GET",
      headers: {
        accept: "application/json",
        authorization: input.context.apiKey,
        "user-agent": providerUserAgent,
      },
      signal: timeout.signal,
    });
    const payload = await readFairingPayload(response);
    if (!response.ok) {
      throw createFairingError(response, payload, input.phase);
    }
    return payload;
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    if (timeout.didTimeout() || isAbortLikeError(error)) {
      throw new ProviderRequestError(504, "Fairing request timed out", error);
    }

    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Fairing request failed: ${error.message}` : "Fairing request failed",
      error,
    );
  } finally {
    timeout.cleanup();
  }
}

async function readFairingPayload(response: Response): Promise<unknown> {
  const text = await response.text().catch(() => "");
  if (!text.trim()) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function createFairingError(response: Response, payload: unknown, phase: FairingPhase): ProviderRequestError {
  const message = (readErrorMessage(payload) ?? response.statusText.trim()) || "Fairing request failed";
  if (response.status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if (phase === "validate" && (response.status === 401 || response.status === 403)) {
    return new ProviderRequestError(response.status, message, payload);
  }
  if (response.status === 401 || response.status === 403) {
    return new ProviderRequestError(response.status, message, payload);
  }
  return new ProviderRequestError(response.status || 502, message, payload);
}

function readErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim()) {
    return payload.trim();
  }
  const record = optionalRecord(payload);
  return optionalString(record?.message) ?? optionalString(record?.error);
}

function readResponseArray(payload: unknown): Array<Record<string, unknown>> {
  const record = requireFairingRecord(payload, "invalid fairing responses payload");
  const data = record.data;
  if (!Array.isArray(data)) {
    throw new ProviderRequestError(502, "invalid fairing responses payload", payload);
  }

  return data.map((item) => requireFairingRecord(item, "invalid fairing response item"));
}

function requireFairingRecord(value: unknown, message: string): Record<string, unknown> {
  const record = optionalRecord(value);
  if (!record) {
    throw new ProviderRequestError(502, message, value);
  }
  return record;
}
