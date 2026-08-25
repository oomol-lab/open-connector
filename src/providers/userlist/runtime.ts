import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext, ProviderRuntimeHandler } from "../provider-runtime.ts";

import { compactObject, optionalRecord, optionalString } from "../../core/cast.ts";
import { providerUserAgent, ProviderRequestError } from "../provider-runtime.ts";

export const userlistPushApiBaseUrl = "https://push.userlist.com";

type UserlistActionHandler = ProviderRuntimeHandler<ApiKeyProviderContext>;

export const userlistActionHandlers: ProviderActionHandlers<"userlist", UserlistActionHandler> = {
  push_user(input, context) {
    assertPushUserInput(input);
    return postAccepted("/users", input, context);
  },
  push_company(input, context) {
    return postAccepted("/companies", input, context);
  },
  push_relationship(input, context) {
    return postAccepted("/relationships", input, context);
  },
  create_event(input, context) {
    assertCreateEventInput(input);
    return postAccepted("/events", input, context);
  },
  send_message(input, context) {
    assertSendMessageInput(input);
    return postAccepted("/messages", input, context);
  },
};

export function validateUserlistCredential(): CredentialValidationResult {
  return {
    profile: {
      accountId: "userlist",
      displayName: "Userlist Push API Key",
    },
    grantedScopes: [],
    metadata: {
      apiBaseUrl: userlistPushApiBaseUrl,
      validation: "No non-mutating Push API validation endpoint is documented by Userlist.",
    },
  };
}

async function postAccepted(
  path: string,
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<Record<string, unknown>> {
  const response = await context.fetcher(`${userlistPushApiBaseUrl}${path}`, {
    method: "POST",
    headers: userlistHeaders(context.apiKey),
    body: JSON.stringify(compactObject(input)),
    signal: context.signal,
  });

  await assertUserlistResponse(response, "execute");
  return { accepted: true, status: response.status };
}

function userlistHeaders(apiKey: string): Record<string, string> {
  return {
    accept: "application/json",
    authorization: `Push ${apiKey}`,
    "content-type": "application/json; charset=utf-8",
    "user-agent": providerUserAgent,
  };
}

async function assertUserlistResponse(response: Response, phase: "execute"): Promise<void> {
  if (response.status === 202) {
    return;
  }

  const payload = await readUserlistPayload(response);
  if (response.status === 401 || response.status === 403) {
    throw new ProviderRequestError(
      response.status,
      userlistErrorMessage(payload, "Invalid or expired Userlist Push API key"),
      payload,
    );
  }
  if (response.status >= 400 && response.status < 500) {
    throw new ProviderRequestError(response.status, userlistErrorMessage(payload, "Invalid Userlist request"), payload);
  }

  throw new ProviderRequestError(
    response.status || 502,
    userlistErrorMessage(payload, `Userlist ${phase} request failed`),
    payload,
  );
}

async function readUserlistPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return undefined;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function userlistErrorMessage(payload: unknown, fallback: string): string {
  if (!payload || typeof payload !== "object") {
    return typeof payload === "string" && payload ? payload : fallback;
  }

  const record = payload as Record<string, unknown>;
  if (Array.isArray(record.errors) && record.errors.length > 0) {
    return record.errors.map(String).join("; ");
  }
  if (typeof record.error === "string" && record.error) {
    return record.error;
  }
  if (typeof record.message === "string" && record.message) {
    return record.message;
  }
  if (typeof record.code === "string" && record.code) {
    return record.code;
  }

  return fallback;
}

function assertPushUserInput(input: Record<string, unknown>): void {
  if (input.email === undefined && input.identifier === undefined) {
    throw new ProviderRequestError(400, "identifier or email is required");
  }
}

function assertCreateEventInput(input: Record<string, unknown>): void {
  if (input.user === undefined && input.company === undefined) {
    throw new ProviderRequestError(400, "user or company is required");
  }
}

function assertSendMessageInput(input: Record<string, unknown>): void {
  if (input.user === undefined && input.to === undefined) {
    throw new ProviderRequestError(400, "user or to is required");
  }
  if (input.channel === "web" && input.to !== undefined) {
    throw new ProviderRequestError(400, "to must not be provided for web messages");
  }
  if (input.template === undefined && (input.subject === undefined || input.body === undefined)) {
    throw new ProviderRequestError(400, "template or both subject and body are required");
  }
  assertMessageBody(input.body);
}

function assertMessageBody(value: unknown): void {
  if (value === undefined) {
    return;
  }

  const body = optionalRecord(value);
  if (!body) {
    return;
  }

  const type = optionalString(body.type);
  const contentIsArray = Array.isArray(body.content);
  if (type === "multipart" && !contentIsArray) {
    throw new ProviderRequestError(400, "content must be an array when type is multipart");
  }
  if ((type === "html" || type === "text") && contentIsArray) {
    throw new ProviderRequestError(400, "content must be a string when type is html or text");
  }
}
