import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { optionalBoolean, optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import {
  defineApiKeyProviderExecutors,
  providerUserAgent,
  ProviderRequestError,
  requiredInputString,
} from "../provider-runtime.ts";

const service = "telnyx";
const telnyxApiBaseUrl = "https://api.telnyx.com/v2";
const validationPath = "/messaging_profiles";

type TelnyxRequestPhase = "validate" | "execute";
type TelnyxActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

export const telnyxActionHandlers: ProviderActionHandlers<"telnyx", TelnyxActionHandler> = {
  send_message(input, context) {
    return sendMessage(input, context);
  },
  retrieve_message(input, context) {
    return requestTelnyx({
      path: `/messages/${encodeURIComponent(requiredInputString(input.id, "id"))}`,
      context,
      phase: "execute",
    });
  },
  list_messaging_profiles(input, context) {
    return requestTelnyx({
      path: "/messaging_profiles",
      context,
      query: messagingProfileListQuery(input),
      phase: "execute",
    });
  },
  retrieve_messaging_profile(input, context) {
    return requestTelnyx({
      path: `/messaging_profiles/${encodeURIComponent(requiredInputString(input.id, "id"))}`,
      context,
      phase: "execute",
    });
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, telnyxActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const payload = await requestTelnyx({
      path: validationPath,
      context: { apiKey: input.apiKey, fetcher, signal },
      query: [["page[size]", 1]],
      phase: "validate",
    });

    const firstProfile = readFirstResource(payload);
    return {
      profile: {
        accountId: "telnyx",
        displayName: "Telnyx API Key",
      },
      grantedScopes: [],
      metadata: {
        apiBaseUrl: telnyxApiBaseUrl,
        validationEndpoint: validationPath,
        firstMessagingProfileId: optionalString(firstProfile?.id),
        firstMessagingProfileName: optionalString(firstProfile?.name),
      },
    };
  },
};

function sendMessage(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const from = optionalString(input.from);
  const messagingProfileId = optionalString(input.messagingProfileId);
  const text = optionalString(input.text);
  const mediaUrls = readOptionalStringArray(input.mediaUrls);
  const type = optionalString(input.type);

  if (!from && !messagingProfileId) {
    throw new ProviderRequestError(400, "from or messagingProfileId is required to send a Telnyx message");
  }
  if (type === "SMS" && !text) {
    throw new ProviderRequestError(400, "text is required when type is SMS");
  }
  if (type === "MMS" && (!mediaUrls || mediaUrls.length === 0)) {
    throw new ProviderRequestError(400, "mediaUrls is required when type is MMS");
  }
  if (!type && !text && (!mediaUrls || mediaUrls.length === 0)) {
    throw new ProviderRequestError(400, "text or mediaUrls is required");
  }

  return requestTelnyx({
    path: "/messages",
    method: "POST",
    context,
    body: {
      to: requiredInputString(input.to, "to"),
      from,
      messaging_profile_id: messagingProfileId,
      text,
      subject: optionalString(input.subject),
      media_urls: mediaUrls,
      webhook_url: optionalString(input.webhookUrl),
      webhook_failover_url: optionalString(input.webhookFailoverUrl),
      use_profile_webhooks: optionalBoolean(input.useProfileWebhooks),
      type,
      auto_detect: optionalBoolean(input.autoDetect),
      send_at: input.sendAt === null ? null : optionalString(input.sendAt),
      encoding: optionalString(input.encoding),
    },
    phase: "execute",
  });
}

async function requestTelnyx(input: {
  path: string;
  method?: "GET" | "POST";
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">;
  body?: Record<string, unknown>;
  query?: Array<[string, unknown]>;
  phase: TelnyxRequestPhase;
}): Promise<unknown> {
  const url = new URL(`${telnyxApiBaseUrl}${input.path}`);
  for (const [name, value] of input.query ?? []) {
    appendQueryValue(url, name, value);
  }

  let response: Response;
  try {
    response = await input.context.fetcher(url.toString(), {
      method: input.method ?? "GET",
      headers: telnyxHeaders(input.context.apiKey, input.body !== undefined),
      body: input.body === undefined ? undefined : JSON.stringify(removeUndefined(input.body)),
      signal: input.context.signal,
    });
  } catch (error) {
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `telnyx request failed: ${error.message}` : "telnyx request failed",
    );
  }

  const payload = await readTelnyxPayload(response);
  if (!response.ok) {
    throw createTelnyxError(response, payload, input.phase);
  }

  return payload;
}

function telnyxHeaders(apiKey: string, hasBody: boolean): Record<string, string> {
  const headers: Record<string, string> = {
    accept: "application/json",
    authorization: `Bearer ${apiKey}`,
    "user-agent": providerUserAgent,
  };
  if (hasBody) {
    headers["content-type"] = "application/json";
  }
  return headers;
}

function appendQueryValue(url: URL, name: string, value: unknown): void {
  if (value === undefined || value === null || value === "") {
    return;
  }
  url.searchParams.set(name, String(value));
}

function messagingProfileListQuery(input: Record<string, unknown>): Array<[string, unknown]> {
  return [
    ["filter[name]", input.filterName],
    ["filter[name][eq]", input.filterNameEq],
    ["filter[name][contains]", input.filterNameContains],
    ["page[number]", input.pageNumber],
    ["page[size]", input.pageSize],
  ];
}

async function readTelnyxPayload(response: Response): Promise<unknown> {
  const text = await response.text().catch(() => "");
  if (!text.trim()) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch (error) {
    throw new ProviderRequestError(
      response.status === 429 ? 429 : 502,
      error instanceof Error ? `telnyx returned invalid JSON: ${error.message}` : "telnyx returned invalid JSON",
    );
  }
}

function createTelnyxError(response: Response, payload: unknown, phase: TelnyxRequestPhase): ProviderRequestError {
  const message = extractTelnyxErrorMessage(payload) ?? response.statusText ?? "telnyx request failed";

  if (response.status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if (phase === "validate" && (response.status === 401 || response.status === 403)) {
    return new ProviderRequestError(400, message, payload);
  }
  if (phase === "execute" && (response.status === 401 || response.status === 403)) {
    return new ProviderRequestError(401, message, payload);
  }
  if ([400, 404, 409, 422].includes(response.status)) {
    return new ProviderRequestError(400, message, payload);
  }

  return new ProviderRequestError(response.status || 502, message, payload);
}

function extractTelnyxErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim()) {
    return payload;
  }

  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }

  const errors = Array.isArray(record.errors) ? record.errors : undefined;
  const firstError = errors?.map(optionalRecord).find(Boolean);
  if (firstError) {
    return optionalString(firstError.detail) ?? optionalString(firstError.title) ?? optionalString(firstError.code);
  }

  return (
    optionalString(record.detail) ??
    optionalString(record.message) ??
    optionalString(record.error) ??
    optionalString(record.title)
  );
}

function readFirstResource(payload: unknown): Record<string, unknown> | undefined {
  const record = optionalRecord(payload);
  const data = record?.data;
  if (!Array.isArray(data)) {
    return undefined;
  }
  return data.map(optionalRecord).find(Boolean);
}

function readOptionalStringArray(value: unknown): string[] | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(400, "mediaUrls must be an array");
  }
  return value.map((item) => requiredInputString(item, "mediaUrls"));
}

function removeUndefined(input: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined));
}
