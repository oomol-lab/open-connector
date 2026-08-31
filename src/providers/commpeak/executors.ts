import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import {
  compactObject,
  optionalNumber,
  optionalRecord,
  optionalString,
  optionalStringOrNull as nullableString,
  positiveInteger,
  requiredRecord,
} from "../../core/cast.ts";
import {
  createProviderTimeout,
  defineApiKeyProviderExecutors,
  providerInputError,
  providerUserAgent,
  ProviderRequestError,
  readProviderTextBody,
} from "../provider-runtime.ts";

const service = "commpeak";
const commpeakTextPeakBaseUrl = "https://gw.commpeak.com/textpeak";
const commpeakMaxResponseBytes = 10 * 1024 * 1024;

type CommpeakActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

interface CommpeakRequestOptions {
  readonly phase?: "execute" | "validate";
  readonly signal?: AbortSignal;
}

const commpeakActionHandlers: ProviderActionHandlers<"commpeak", CommpeakActionHandler> = {
  list_streams(input, context) {
    return executeListStreams(input, context);
  },
  get_stream(input, context) {
    return executeGetStream(input, context);
  },
  get_stream_token(input, context) {
    return executeGetStreamToken(input, context);
  },
  list_senders(input, context) {
    return executeListSenders(input, context);
  },
  list_domains(input, context) {
    return executeListDomains(input, context);
  },
  list_messages(input, context) {
    return executeListMessages(input, context);
  },
  list_incoming_messages(input, context) {
    return executeListIncomingMessages(input, context);
  },
  send_sms(input, context) {
    return executeSendSms(input, context);
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, commpeakActionHandlers, {
  skipDnsValidation: true,
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const payload = await commpeakGetJson(
      "/streams",
      input.apiKey,
      fetcher,
      { itemsPerPage: 1 },
      { phase: "validate", signal },
    );
    const streams = Array.isArray(payload) ? payload.map(normalizeStream) : [];
    const firstStream = streams[0];
    return {
      profile: {
        accountId: firstStream?.id == null ? "api_key" : String(firstStream.id),
        displayName: firstStream?.name ? `CommPeak: ${firstStream.name}` : "CommPeak TextPeak API Key",
      },
      grantedScopes: [],
      metadata: compactObject({
        apiBaseUrl: commpeakTextPeakBaseUrl,
        validationEndpoint: "/streams",
        firstStreamId: firstStream?.id ?? undefined,
        firstStreamName: firstStream?.name ?? undefined,
      }),
    };
  },
};

async function executeListStreams(input: Record<string, unknown>, context: ApiKeyProviderContext) {
  const payload = await commpeakGetJson("/streams", context.apiKey, context.fetcher, listParams(input), {
    signal: context.signal,
  });
  return {
    streams: readArray(payload).map(normalizeStream),
  };
}

async function executeGetStream(input: Record<string, unknown>, context: ApiKeyProviderContext) {
  const streamId = positiveInteger(input.streamId, "streamId", providerInputError);
  const payload = await commpeakGetJson(`/streams/${streamId}`, context.apiKey, context.fetcher, undefined, {
    signal: context.signal,
  });
  return {
    stream: normalizeStream(requireResponseObject(payload)),
  };
}

async function executeGetStreamToken(input: Record<string, unknown>, context: ApiKeyProviderContext) {
  const streamId = positiveInteger(input.streamId, "streamId", providerInputError);
  const token = await getStreamToken(streamId, context);
  return { token };
}

async function executeListSenders(input: Record<string, unknown>, context: ApiKeyProviderContext) {
  const payload = await commpeakGetJson("/senders", context.apiKey, context.fetcher, listParams(input), {
    signal: context.signal,
  });
  return {
    senders: readArray(payload).map(normalizeSender),
  };
}

async function executeListDomains(input: Record<string, unknown>, context: ApiKeyProviderContext) {
  const payload = await commpeakGetJson("/domains", context.apiKey, context.fetcher, listParams(input), {
    signal: context.signal,
  });
  return {
    domains: readArray(payload).map(normalizeDomain),
  };
}

async function executeListMessages(input: Record<string, unknown>, context: ApiKeyProviderContext) {
  const payload = await commpeakGetJson(
    "/streams/messages",
    context.apiKey,
    context.fetcher,
    compactObject({
      type: optionalString(input.type),
      status: optionalString(input.status),
      streamId: optionalNumber(input.streamId),
      phone: optionalString(input.phone),
      startDate: optionalString(input.startDate),
      endDate: optionalString(input.endDate),
      page: optionalNumber(input.page),
      itemsPerPage: optionalNumber(input.itemsPerPage),
    }),
    { signal: context.signal },
  );
  const page = readPage(payload);
  return {
    items: page.items.map(normalizeOutgoingMessage),
    page: {
      totalItems: page.totalItems,
      raw: optionalRecord(payload) ?? {},
    },
  };
}

async function executeListIncomingMessages(input: Record<string, unknown>, context: ApiKeyProviderContext) {
  const payload = await commpeakGetJson(
    "/streams/incoming_messages",
    context.apiKey,
    context.fetcher,
    compactObject({
      streamId: optionalNumber(input.streamId),
      sender: optionalString(input.sender),
      destination: optionalString(input.destination),
      startDate: optionalString(input.startDate),
      endDate: optionalString(input.endDate),
      page: optionalNumber(input.page),
      itemsPerPage: optionalNumber(input.itemsPerPage),
    }),
    { signal: context.signal },
  );
  const page = readPage(payload);
  return {
    items: page.items.map(normalizeIncomingMessage),
    page: {
      totalItems: page.totalItems,
      raw: optionalRecord(payload) ?? {},
    },
  };
}

async function executeSendSms(input: Record<string, unknown>, context: ApiKeyProviderContext) {
  const streamId = positiveInteger(input.streamId, "streamId", providerInputError);
  const sender = optionalString(input.sender);
  const messages = readArray(input.messages).map((message) => {
    const item = requireResponseObject(message);
    return compactObject({
      internal_id: optionalString(item.internalId),
      sender: optionalString(item.sender),
      recipient_phone: optionalString(item.recipientPhone),
      message_content: optionalString(item.messageContent),
    });
  });
  if (!sender && messages.some((message) => !message.sender)) {
    throw providerInputError("sender is required on every message when top-level sender is omitted");
  }

  const streamToken = await getStreamToken(streamId, context);
  const payload = await commpeakPostJson(
    "/streams/simple_send",
    compactObject({
      sender,
      messages,
    }),
    streamToken,
    context.fetcher,
    { signal: context.signal },
  );
  const object = requireResponseObject(payload);

  return {
    status: object.status === true,
    taskId: nullableString(object.task_id),
    messages: readArray(object.messages).map(normalizeSmsSendMessageResult),
    raw: object,
  };
}

async function getStreamToken(streamId: number, context: ApiKeyProviderContext) {
  const payload = await commpeakGetJson(`/streams/${streamId}/token`, context.apiKey, context.fetcher, undefined, {
    signal: context.signal,
  });
  const token = optionalString(requireResponseObject(payload).token);
  if (!token) {
    throw new ProviderRequestError(502, "CommPeak did not return a stream token");
  }
  return token;
}

async function commpeakGetJson(
  path: string,
  token: string,
  fetcher: typeof fetch,
  query?: Record<string, string | number | undefined>,
  options: CommpeakRequestOptions = {},
) {
  const url = commpeakTextPeakUrl(path);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }

  return commpeakRequestJson(
    url,
    {
      method: "GET",
      headers: commpeakHeaders(token, {
        accept: "application/json",
      }),
    },
    fetcher,
    options,
  );
}

async function commpeakPostJson(
  path: string,
  body: Record<string, unknown>,
  token: string,
  fetcher: typeof fetch,
  options: CommpeakRequestOptions = {},
) {
  return commpeakRequestJson(
    commpeakTextPeakUrl(path),
    {
      method: "POST",
      headers: commpeakHeaders(token, {
        accept: "application/json",
        "content-type": "application/json",
      }),
      body: JSON.stringify(body),
    },
    fetcher,
    options,
  );
}

async function commpeakRequestJson(
  url: URL,
  init: RequestInit,
  fetcher: typeof fetch,
  options: CommpeakRequestOptions = {},
) {
  const timeout = createProviderTimeout(options.signal);
  try {
    const response = await fetcher(url, { ...init, signal: timeout.signal });
    const payload = await readCommpeakPayload(response);
    if (!response.ok || isFailureEnvelope(payload)) {
      throw createCommpeakError(response, payload, options);
    }
    return payload;
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    if (timeout.didTimeout()) {
      throw new ProviderRequestError(504, "CommPeak request timed out");
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `CommPeak request failed: ${error.message}` : "CommPeak request failed",
    );
  } finally {
    timeout.cleanup();
  }
}

function commpeakTextPeakUrl(path: string) {
  return new URL(`${commpeakTextPeakBaseUrl}${path}`);
}

function commpeakHeaders(token: string, extraHeaders: Record<string, string>) {
  return {
    Authorization: token,
    "user-agent": providerUserAgent,
    ...extraHeaders,
  };
}

async function readCommpeakPayload(response: Response) {
  const text = await readProviderTextBody(response, "CommPeak response", commpeakMaxResponseBytes);
  if (!text.trim()) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function createCommpeakError(response: Response, payload: unknown, options: CommpeakRequestOptions) {
  const message = extractCommpeakErrorMessage(payload) ?? response.statusText ?? "CommPeak request failed";

  if (response.status === 429) {
    return new ProviderRequestError(429, message);
  } else if (response.status === 401 || response.status === 403) {
    if (options.phase === "validate") {
      return new ProviderRequestError(401, message);
    } else {
      return new ProviderRequestError(401, message);
    }
  } else if ([400, 404, 422].includes(response.status)) {
    return new ProviderRequestError(response.status, message);
  } else {
    return new ProviderRequestError(response.status >= 500 || response.status < 400 ? 502 : response.status, message);
  }
}

function extractCommpeakErrorMessage(payload: unknown) {
  if (typeof payload === "string" && payload.trim()) {
    return payload;
  }

  const object = optionalRecord(payload);
  return (
    optionalString(object?.message) ??
    optionalString(object?.error) ??
    optionalString(object?.detail) ??
    optionalString(object?.title)
  );
}

function isFailureEnvelope(payload: unknown) {
  const object = optionalRecord(payload);
  return object?.status === false;
}

function listParams(input: Record<string, unknown>) {
  return compactObject({
    _page: optionalNumber(input.page),
    itemsPerPage: optionalNumber(input.itemsPerPage),
  });
}

function readArray(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function readPage(payload: unknown) {
  const object = optionalRecord(payload);
  const items = readArray(object?.items);
  const totalItems = nullableNumber(object?.totalItems ?? object?.total_items ?? object?.total);
  return { items, totalItems };
}

function normalizeStream(value: unknown) {
  const object = requireResponseObject(value);
  return {
    id: nullableNumber(object.id),
    streamUid: nullableString(object.streamUid),
    name: nullableString(object.name),
    description: nullableString(object.description),
    type: nullableString(object.type),
    callerId: nullableString(object.callerId),
    ipAcl: nullableString(object.ipAcl),
    state: nullableString(object.state),
    streamTags: readArray(object.streamTags).map(normalizeStreamTag),
    raw: object,
  };
}

function normalizeStreamTag(value: unknown) {
  const object = requireResponseObject(value);
  return {
    id: nullableNumber(object.id),
    value: nullableString(object.value),
  };
}

function normalizeSender(value: unknown) {
  const object = requireResponseObject(value);
  return {
    id: nullableNumber(object.id),
    name: nullableString(object.name),
    value: nullableString(object.value),
    dailyLimit: nullableNumber(object.dailyLimit),
    stream: nullableString(object.stream),
    senderType: nullableString(object.senderType),
    status: nullableString(object.status),
    raw: object,
  };
}

function normalizeDomain(value: unknown) {
  const object = requireResponseObject(value);
  return {
    id: nullableNumber(object.id),
    name: nullableString(object.name),
    ip: nullableString(object.ip),
    status: nullableString(object.status),
    raw: object,
  };
}

function normalizeOutgoingMessage(value: unknown) {
  const object = requireResponseObject(value);
  const content = optionalRecord(object.content);
  return {
    type: nullableString(object.type),
    messageUuid: nullableString(object.message_uuid),
    externalKey: nullableString(object.external_key),
    sentAt: nullableString(object.sent_at),
    deliveredAt: nullableString(object.delivered_at),
    status: nullableString(object.status),
    sourceNumber: nullableString(object.source_number),
    sourceName: nullableString(object.source_name),
    destinationNumber: nullableString(object.destination_number),
    countryCode: nullableString(object.country_code),
    countryIso: nullableString(object.country_iso),
    countryName: nullableString(object.country_name),
    cost: nullableNumber(object.cost),
    channel: nullableString(object.channel),
    content: content
      ? {
          type: nullableString(content.type),
          text: nullableString(content.text),
        }
      : null,
    conversationUuid: nullableString(object.conversation_uuid),
    streamId: nullableString(object.stream_id),
    campaignId: nullableString(object.campaign_id),
    raw: object,
  };
}

function normalizeIncomingMessage(value: unknown) {
  const object = requireResponseObject(value);
  return {
    messageUuid: nullableString(object.message_uuid),
    receivedAt: nullableString(object.received_at),
    sourceNumber: nullableString(object.source_number),
    destinationNumber: nullableString(object.destination_number),
    contactName: nullableString(object.contact_name),
    countryCode: nullableString(object.country_code),
    countryIso: nullableString(object.country_iso),
    countryName: nullableString(object.country_name),
    text: nullableString(object.text),
    length: nullableNumber(object.length),
    conversationUuid: nullableString(object.conversation_uuid),
    streamId: nullableString(object.stream_id),
    raw: object,
  };
}

function normalizeSmsSendMessageResult(value: unknown) {
  const object = requireResponseObject(value);
  return {
    internalId: nullableString(object.internal_id),
    messageUuid: nullableString(object.message_uuid),
    conversationUuid: nullableString(object.conversation_uuid),
    error: nullableString(object.error),
    details: nullableString(object.details),
    raw: object,
  };
}

function requireResponseObject(value: unknown): Record<string, unknown> {
  return requiredRecord(value, "CommPeak response", (message) => new ProviderRequestError(502, message));
}

function nullableNumber(value: unknown): number | null {
  return optionalNumber(value) ?? null;
}
