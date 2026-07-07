import type {
  CredentialValidators,
  ProviderExecutors,
  ProviderProxyExecutor,
  ProxyExecutionResult,
} from "../../core/types.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";
import type { SegmentActionName } from "./actions.ts";

import { compactObject, optionalRawString, optionalRecord, requiredRecord } from "../../core/cast.ts";
import {
  createProviderProxyUrl,
  defineApiKeyProviderExecutors,
  normalizeProviderProxyHeaders,
  ProviderRequestError,
  providerUserAgent,
  readProviderProxyErrorMessage,
  readProviderProxyResponse,
  requireApiKeyCredential,
  toProviderProxyError,
} from "../provider-runtime.ts";

const service = "segment";
const segmentApiBaseUrl = "https://api.segment.io/v1";

type SegmentActionContext = Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">;
type SegmentActionHandler = (input: Record<string, unknown>, context: SegmentActionContext) => Promise<unknown>;

export const segmentActionHandlers: Record<SegmentActionName, SegmentActionHandler> = {
  identify(input, context) {
    return requestSegment("identify", withWriteKey(input, context.apiKey), context);
  },
  track(input, context) {
    return requestSegment("track", withWriteKey(input, context.apiKey), context);
  },
  page(input, context) {
    return requestSegment("page", withWriteKey(input, context.apiKey), context);
  },
  screen(input, context) {
    return requestSegment("screen", withWriteKey(input, context.apiKey), context);
  },
  group(input, context) {
    return requestSegment("group", withWriteKey(input, context.apiKey), context);
  },
  alias(input, context) {
    return requestSegment("alias", withWriteKey(input, context.apiKey), context);
  },
  batch(input, context) {
    validateSegmentBatch(input.batch);
    return requestSegment("batch", withWriteKey(input, context.apiKey), context);
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, segmentActionHandlers);

export const proxy: ProviderProxyExecutor = async (input, context): Promise<ProxyExecutionResult> => {
  try {
    const credential = await requireApiKeyCredential(context, service);
    const url = createProviderProxyUrl(segmentApiBaseUrl, input.endpoint, input.query);
    const headers = normalizeProviderProxyHeaders(input.headers);
    headers.set("accept", "application/json");
    headers.set("content-type", "application/json");
    headers.set("user-agent", providerUserAgent);

    const response = await fetch(url, {
      method: input.method,
      headers,
      body: JSON.stringify(withWriteKey(optionalRecord(input.body) ?? {}, credential.apiKey)),
      signal: context.signal,
    });
    if (!response.ok) {
      const text = await readProviderProxyErrorMessage(response, "");
      throw new ProviderRequestError(response.status, text || `provider request failed with HTTP ${response.status}`);
    }
    return { ok: true, response: await readProviderProxyResponse(response) };
  } catch (error) {
    return toProviderProxyError(error, "provider request failed");
  }
};

export const credentialValidators: CredentialValidators = {
  async apiKey(input) {
    const writeKey = input.apiKey.trim();
    if (!writeKey) {
      throw new ProviderRequestError(400, "segment write key is required");
    }

    return {
      profile: {
        accountId: "write_key",
        displayName: "Segment Write Key",
      },
      grantedScopes: [],
      metadata: {
        apiBaseUrl: segmentApiBaseUrl,
        validationMode: "format_only",
      },
    };
  },
};

function withWriteKey(input: Record<string, unknown>, writeKey: string): Record<string, unknown> {
  return compactObject({
    ...input,
    writeKey,
  });
}

async function requestSegment(
  endpoint: string,
  body: Record<string, unknown>,
  context: SegmentActionContext,
): Promise<Record<string, unknown>> {
  const response = await context.fetcher(`${segmentApiBaseUrl}/${endpoint}`, {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      "user-agent": providerUserAgent,
    },
    body: JSON.stringify(body),
    signal: context.signal,
  });
  const payload = await readSegmentPayload(response);
  if (!response.ok) {
    throw mapSegmentHttpError(response.status, payload);
  }

  return {
    accepted: true,
    status: response.status,
    raw: payload,
  };
}

async function readSegmentPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text.trim()) {
    return null;
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("json")) {
    try {
      return JSON.parse(text) as unknown;
    } catch {
      return text;
    }
  }

  return text;
}

function mapSegmentHttpError(status: number, payload: unknown): ProviderRequestError {
  const message = readSegmentErrorMessage(payload) ?? `Segment request failed with HTTP ${status}`;
  if (status === 401 || status === 403) {
    return new ProviderRequestError(status, message, payload);
  }
  if (status === 400 || status === 422) {
    return new ProviderRequestError(status, message, payload);
  }
  if (status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  return new ProviderRequestError(status >= 500 ? 502 : status || 500, message, payload);
}

function readSegmentErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim()) {
    return payload.trim();
  }

  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }

  const directMessage =
    optionalRawString(record.message) ?? optionalRawString(record.error) ?? optionalRawString(record.errorMessage);
  if (directMessage) {
    return directMessage;
  }

  if (Array.isArray(record.errors) && record.errors.length > 0) {
    const first = record.errors[0];
    const firstRecord = optionalRecord(first);
    return firstRecord
      ? (optionalRawString(firstRecord.message) ?? optionalRawString(firstRecord.error))
      : optionalRawString(first);
  }

  return undefined;
}

function validateSegmentBatch(value: unknown): void {
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(400, "batch must be an array");
  }

  value.forEach((item, index) => {
    const event = requiredRecord(item, `batch[${index}]`, inputError);
    const type = optionalRawString(event.type);
    switch (type) {
      case "identify":
      case "page":
      case "screen":
        requireUserIdOrAnonymousId(event, `batch[${index}]`);
        return;
      case "track":
        requireUserIdOrAnonymousId(event, `batch[${index}]`);
        requireStringField(event, "event", `batch[${index}]`);
        return;
      case "group":
        requireUserIdOrAnonymousId(event, `batch[${index}]`);
        requireStringField(event, "groupId", `batch[${index}]`);
        return;
      default:
        throw new ProviderRequestError(400, `batch[${index}].type is not supported`);
    }
  });
}

function requireUserIdOrAnonymousId(event: Record<string, unknown>, prefix: string): void {
  const userId = optionalRawString(event.userId);
  const anonymousId = optionalRawString(event.anonymousId);
  if (!userId && !anonymousId) {
    throw new ProviderRequestError(400, `${prefix} requires userId or anonymousId`);
  }
}

function requireStringField(event: Record<string, unknown>, fieldName: string, prefix: string): void {
  if (!optionalRawString(event[fieldName])) {
    throw new ProviderRequestError(400, `${prefix}.${fieldName} is required`);
  }
}

function inputError(message: string): ProviderRequestError {
  return new ProviderRequestError(400, message);
}
