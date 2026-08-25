import type { CredentialValidators, ExecutionContext, ProviderExecutors } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";

import { compactObject, optionalBoolean, optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import {
  createProviderTimeout,
  defineProviderExecutors,
  isAbortLikeError,
  providerUserAgent,
  ProviderRequestError,
  requireApiKeyCredential,
} from "../provider-runtime.ts";

const service = "push_by_techulus";
const pushByTechulusApiBaseUrl = "https://push.techulus.com/api/v1";
const pushByTechulusDefaultRequestTimeoutMs = 30_000;

type PushByTechulusRequestPhase = "validate" | "execute";

interface PushByTechulusActionContext {
  apiKey: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

type PushByTechulusActionHandler = (
  input: Record<string, unknown>,
  context: PushByTechulusActionContext,
) => Promise<unknown>;

export const pushByTechulusActionHandlers: ProviderActionHandlers<"push_by_techulus", PushByTechulusActionHandler> = {
  send_notification(input, context) {
    return sendPushByTechulusNotification("notify", input, context);
  },
  send_group_notification(input, context) {
    const groupId = requiredString(input.groupId, "groupId", (message) => new ProviderRequestError(400, message));
    return sendPushByTechulusNotification(`notify/group/${encodeURIComponent(groupId)}`, input, context);
  },
};

export const executors: ProviderExecutors = defineProviderExecutors<PushByTechulusActionContext>({
  service,
  handlers: pushByTechulusActionHandlers,
  async createContext(context: ExecutionContext, fetcher: typeof fetch): Promise<PushByTechulusActionContext> {
    const credential = await requireApiKeyCredential(context, service);
    return {
      apiKey: credential.apiKey,
      fetcher,
      signal: context.signal,
    };
  },
});

export const credentialValidators: CredentialValidators = {
  apiKey(input) {
    requiredString(input.apiKey, "apiKey", (message) => new ProviderRequestError(400, message));
    return Promise.resolve({
      profile: {
        accountId: "api_key",
        displayName: "Push by Techulus API Key",
      },
      grantedScopes: [],
      metadata: {
        apiBaseUrl: pushByTechulusApiBaseUrl,
        validationMode: "local_non_empty_key",
        validationReason: "official_api_only_documents_notification_sending_endpoints",
      },
    });
  },
};

async function sendPushByTechulusNotification(
  path: string,
  input: Record<string, unknown>,
  context: PushByTechulusActionContext,
): Promise<unknown> {
  const response = await requestPushByTechulusJson({
    apiKey: context.apiKey,
    path,
    body: buildPushByTechulusNotificationPayload(input),
    context,
    phase: "execute",
  });

  return parsePushByTechulusSuccessResponse(response);
}

function buildPushByTechulusNotificationPayload(input: Record<string, unknown>): Record<string, unknown> {
  return compactObject({
    title: requiredString(input.title, "title", (message) => new ProviderRequestError(400, message)),
    body: requiredString(input.body, "body", (message) => new ProviderRequestError(400, message)),
    sound: optionalString(input.sound),
    channel: optionalString(input.channel),
    link: optionalString(input.link),
    image: optionalString(input.image),
    timeSensitive: optionalBoolean(input.timeSensitive),
  });
}

async function requestPushByTechulusJson(input: {
  apiKey: string;
  path: string;
  body: Record<string, unknown>;
  context: PushByTechulusActionContext;
  phase: PushByTechulusRequestPhase;
}): Promise<unknown> {
  const timeout = createProviderTimeout(input.context.signal, pushByTechulusDefaultRequestTimeoutMs);
  let response: Response;
  try {
    response = await input.context.fetcher(new URL(input.path, `${pushByTechulusApiBaseUrl}/`), {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        "user-agent": providerUserAgent,
        "x-api-key": input.apiKey,
      },
      body: JSON.stringify(input.body),
      signal: timeout.signal,
    });
  } catch (error) {
    if (timeout.didTimeout()) {
      throw new ProviderRequestError(
        504,
        `push_by_techulus request timed out after ${pushByTechulusDefaultRequestTimeoutMs}ms`,
      );
    }
    if (isAbortLikeError(error)) {
      throw new ProviderRequestError(502, "push_by_techulus request aborted");
    }
    throw new ProviderRequestError(
      502,
      `push_by_techulus request failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  } finally {
    timeout.cleanup();
  }

  const payload = await readPushByTechulusPayload(response);
  if (!response.ok) {
    throw normalizePushByTechulusError(response, payload, input.phase);
  }

  return payload;
}

async function readPushByTechulusPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "push_by_techulus returned invalid JSON response");
  }
}

function parsePushByTechulusSuccessResponse(payload: unknown): Record<string, unknown> {
  const record = optionalRecord(payload);
  if (!record || typeof record.success !== "boolean") {
    throw new ProviderRequestError(502, "push_by_techulus response did not include a boolean success field", payload);
  }

  return compactObject({
    success: record.success,
    message: optionalString(record.message),
    responses: parsePushByTechulusResponses(record.responses),
  });
}

function parsePushByTechulusResponses(value: unknown): Array<{ success: boolean; message: string }> | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  return value.map((item) => {
    const record = optionalRecord(item);
    if (!record || typeof record.success !== "boolean" || typeof record.message !== "string") {
      throw new ProviderRequestError(
        502,
        "push_by_techulus response included an invalid per-device response item",
        value,
      );
    }
    return {
      success: record.success,
      message: record.message,
    };
  });
}

function normalizePushByTechulusError(
  response: Response,
  payload: unknown,
  phase: PushByTechulusRequestPhase,
): ProviderRequestError {
  const message = readPushByTechulusErrorMessage(payload) ?? response.statusText;
  if (response.status === 401 || response.status === 403 || response.status === 400) {
    return new ProviderRequestError(
      response.status,
      `${phase === "execute" ? "push_by_techulus request" : "push_by_techulus credential validation"} failed: ${message}`,
      payload,
    );
  }
  if (response.status === 429) {
    return new ProviderRequestError(429, `push_by_techulus rate limit exceeded: ${message}`, payload);
  }

  return new ProviderRequestError(response.status || 502, `push_by_techulus provider error: ${message}`, payload);
}

function readPushByTechulusErrorMessage(payload: unknown): string | undefined {
  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }

  const message = optionalString(record.message);
  if (message) {
    return message;
  }

  const error = record.error;
  if (typeof error === "string") {
    return error;
  }
  const errorRecord = optionalRecord(error);
  const errorMessage = optionalString(errorRecord?.message) ?? optionalString(errorRecord?.code);
  if (errorMessage) {
    return errorMessage;
  }
  if (errorRecord) {
    return JSON.stringify(errorRecord);
  }
  return undefined;
}
