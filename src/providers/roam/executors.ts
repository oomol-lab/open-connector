import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { compactObject, optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import { defineApiKeyProviderExecutors, providerUserAgent, ProviderRequestError } from "../provider-runtime.ts";

const service = "roam";
const roamApiBaseUrl = "https://api.ro.am/v1";

type RoamRequestPhase = "validate" | "execute";
type RoamActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

export const roamActionHandlers: ProviderActionHandlers<"roam", RoamActionHandler> = {
  async list_groups(_input, context) {
    const payload = await requestRoamJson({
      context,
      path: "/groups.list",
      phase: "execute",
    });

    return {
      groups: readArrayPayload(payload),
      raw: payload,
    };
  },

  async send_message(input, context) {
    const payload = await requestRoamJson({
      context,
      path: "/chat.sendMessage",
      phase: "execute",
      method: "POST",
      body: buildSendMessageBody(input),
    });
    const object = optionalRecord(payload) ?? {};

    return {
      chatId: optionalString(object.chatId) ?? "",
      status: optionalString(object.status) ?? "",
      raw: object,
    };
  },

  async list_recordings(input, context) {
    const payload = await requestRoamJson({
      context,
      path: "/recording.list",
      phase: "execute",
      query: buildQuery(input),
    });
    const object = optionalRecord(payload) ?? {};

    return {
      recordings: readArrayPayload(object.recordings),
      nextCursor: optionalString(object.nextCursor) ?? null,
      raw: object,
    };
  },

  async list_magicasts(input, context) {
    const payload = await requestRoamJson({
      context,
      path: "/magicast.list",
      phase: "execute",
      query: buildQuery(input),
    });
    const object = optionalRecord(payload) ?? {};

    return {
      magicasts: readArrayPayload(object.magicasts),
      nextCursor: optionalString(object.nextCursor) ?? null,
      raw: object,
    };
  },

  async get_magicast(input, context) {
    const payload = await requestRoamJson({
      context,
      path: "/magicast.info",
      phase: "execute",
      query: {
        id: optionalString(input.id),
      },
    });
    const object = optionalRecord(payload) ?? {};

    return {
      magicast: object,
      raw: object,
    };
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, roamActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const payload = await requestRoamJson({
      context: {
        apiKey: input.apiKey,
        fetcher,
        signal,
      },
      path: "/test",
      phase: "validate",
    });

    return {
      profile: {
        displayName: "Roam HQ API Key",
      },
      grantedScopes: [],
      metadata: compactObject({
        apiBaseUrl: roamApiBaseUrl,
        validationEndpoint: "/test",
        validationStatus: readOptionalStatus(payload),
      }),
    };
  },
};

async function requestRoamJson(input: {
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">;
  path: string;
  phase: RoamRequestPhase;
  method?: string;
  query?: Record<string, string | number | undefined>;
  body?: unknown;
}): Promise<unknown> {
  let response: Response;
  let payload: unknown;
  try {
    response = await input.context.fetcher(buildRoamUrl(input.path, input.query), {
      method: input.method,
      headers: {
        ...roamHeaders(input.context.apiKey),
      },
      body: input.body === undefined ? undefined : JSON.stringify(input.body),
      signal: input.context.signal,
    });
    payload = await readRoamPayload(response);
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }

    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Roam HQ request failed: ${error.message}` : "Roam HQ request failed",
      error,
    );
  }

  if (!response.ok) {
    throw createRoamError(response, payload, input.phase);
  }

  return payload;
}

function buildRoamUrl(path: string, query?: Record<string, string | number | undefined>): URL {
  const url = new URL(`${roamApiBaseUrl}${path}`);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined && value !== "") {
      url.searchParams.set(key, String(value));
    }
  }
  return url;
}

function roamHeaders(apiKey: string): Record<string, string> {
  return {
    accept: "application/json",
    authorization: `Bearer ${apiKey}`,
    "content-type": "application/json",
    "user-agent": providerUserAgent,
  };
}

async function readRoamPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { message: text };
  }
}

function createRoamError(response: Response, payload: unknown, _phase: RoamRequestPhase): ProviderRequestError {
  const message = readErrorMessage(payload) ?? `Roam HQ request failed with ${response.status}`;
  if (response.status === 401 || response.status === 403) {
    return new ProviderRequestError(400, message, payload);
  }

  if (response.status === 400 || response.status === 404 || response.status === 405) {
    return new ProviderRequestError(response.status, message, payload);
  }

  if (response.status === 429) {
    return new ProviderRequestError(429, message, payload);
  }

  return new ProviderRequestError(response.status || 500, message, payload);
}

function readErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim()) {
    return payload.trim();
  }

  const object = optionalRecord(payload);
  if (!object) {
    return undefined;
  }

  return optionalString(object.message) ?? optionalString(object.error) ?? optionalString(object.detail);
}

function buildSendMessageBody(input: Record<string, unknown>): Record<string, unknown> {
  const body: Record<string, unknown> = {
    recipients: [readRequiredInputString(input, "groupId")],
    text: readRequiredInputString(input, "text"),
  };
  if (typeof input.markdown === "boolean") {
    body.markdown = input.markdown;
  }
  if (optionalRecord(input.sender)) {
    body.sender = input.sender;
  }
  return body;
}

function buildQuery(input: Record<string, unknown>): Record<string, string | number> {
  const query: Record<string, string | number> = {};
  for (const [key, value] of Object.entries(input)) {
    if (typeof value === "string" && value.trim()) {
      query[key] = value.trim();
    } else if (typeof value === "number") {
      query[key] = value;
    }
  }
  return query;
}

function readRequiredInputString(input: Record<string, unknown>, key: string): string {
  return requiredString(input[key], key, (message) => new ProviderRequestError(400, message));
}

function readOptionalStatus(payload: unknown): string | undefined {
  const object = optionalRecord(payload);
  if (!object) {
    return undefined;
  }

  return optionalString(object.status) ?? optionalString(object.message);
}

function readArrayPayload(payload: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(payload)) {
    return payload.map((item) => optionalRecord(item) ?? {});
  }

  return [];
}
