import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext, ProviderFetch, ProviderRuntimeHandler } from "../provider-runtime.ts";

import { compactObject, optionalRecord, optionalString } from "../../core/cast.ts";
import { isAbortLikeError, providerUserAgent, ProviderRequestError } from "../provider-runtime.ts";

const eventeeApiBaseUrl = "https://api.eventee.com/public/v1";
const eventeeValidationPath = "/groups";

type EventeeRequestMode = "validate" | "execute";
type EventeeContext = Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">;
type EventeeActionHandler = ProviderRuntimeHandler<ApiKeyProviderContext>;

interface EventeeRequestOptions {
  path: string;
  mode: EventeeRequestMode;
}

export const eventeeActionHandlers: ProviderActionHandlers<"eventee", EventeeActionHandler> = {
  async get_event_content(_input, context) {
    const payload = await requestEventeeObject({ path: "/content", mode: "execute" }, context);
    return {
      content: {
        halls: requireArrayField(payload.halls, "halls"),
        lectures: requireArrayField(payload.lectures, "lectures"),
        workshops: requireArrayField(payload.workshops, "workshops"),
        pauses: requireArrayField(payload.pauses, "pauses"),
        speakers: requireArrayField(payload.speakers, "speakers"),
        tracks: requireArrayField(payload.tracks, "tracks"),
      },
    };
  },
  async list_reviews(_input, context) {
    return { reviews: await requestEventeeArray({ path: "/reviews", mode: "execute" }, context) };
  },
  async list_groups(_input, context) {
    return { groups: await requestEventeeArray({ path: "/groups", mode: "execute" }, context) };
  },
  async list_participants(_input, context) {
    return { participants: await requestEventeeArray({ path: "/participants", mode: "execute" }, context) };
  },
  async list_registrations(_input, context) {
    const payload = await requestEventeeJson({ path: "/registrations", mode: "execute" }, context);
    return { registrations: Array.isArray(payload) ? payload : [payload] };
  },
};

export async function validateEventeeCredential(
  apiKey: string,
  fetcher: ProviderFetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const groups = await requestEventeeArray(
    { path: eventeeValidationPath, mode: "validate" },
    { apiKey, fetcher, signal },
  );

  return {
    profile: {
      accountId: "api_token",
      displayName: "Eventee API Token",
    },
    grantedScopes: [],
    metadata: compactObject({
      apiBaseUrl: eventeeApiBaseUrl,
      validationEndpoint: eventeeValidationPath,
      groupCount: groups.length,
    }),
  };
}

async function requestEventeeJson(options: EventeeRequestOptions, context: EventeeContext): Promise<unknown> {
  let response: Response;
  try {
    response = await context.fetcher(`${eventeeApiBaseUrl}${options.path}`, {
      method: "GET",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${context.apiKey}`,
        "user-agent": providerUserAgent,
      },
      signal: context.signal,
    });
  } catch (error) {
    if (isAbortLikeError(error)) {
      throw new ProviderRequestError(504, "Eventee request timed out", error);
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Eventee request failed: ${error.message}` : "Eventee request failed",
      error,
    );
  }

  if (!response.ok) {
    throw await buildEventeeError(response, options.mode);
  }

  return parseEventeeResponse(response);
}

async function requestEventeeObject(
  options: EventeeRequestOptions,
  context: EventeeContext,
): Promise<Record<string, unknown>> {
  const payload = await requestEventeeJson(options, context);
  const record = optionalRecord(payload);
  if (!record) {
    throw new ProviderRequestError(502, "Eventee returned an unexpected array response", payload);
  }
  return record;
}

async function requestEventeeArray(options: EventeeRequestOptions, context: EventeeContext): Promise<unknown[]> {
  return requireArrayField(await requestEventeeJson(options, context), "array payload");
}

async function parseEventeeResponse(response: Response): Promise<unknown> {
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    throw new ProviderRequestError(502, "Eventee returned a non-JSON response");
  }
  try {
    return (await response.json()) as unknown;
  } catch {
    throw new ProviderRequestError(502, "Eventee returned invalid JSON response");
  }
}

async function buildEventeeError(response: Response, mode: EventeeRequestMode): Promise<ProviderRequestError> {
  const status = response.status;
  const contentType = response.headers.get("content-type") ?? "";
  let message = `Eventee request failed with status ${status}`;
  if (contentType.includes("application/json")) {
    const payload = await response.json().catch(() => undefined);
    const body = optionalRecord(payload);
    message = optionalString(body?.error) ?? message;
  } else {
    const text = (await response.text().catch(() => "")).trim();
    if (text) {
      message = text;
    }
  }

  if (status === 401 || status === 403) {
    return new ProviderRequestError(mode === "validate" ? 400 : 401, message);
  }
  if (status === 429) {
    return new ProviderRequestError(429, message);
  }
  return new ProviderRequestError(status || 502, message);
}

function requireArrayField(value: unknown, fieldName: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(502, `Eventee returned invalid ${fieldName}`, value);
  }
  return value;
}
