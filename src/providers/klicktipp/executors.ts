import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { optionalNumber, optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import {
  createProviderTimeout,
  defineApiKeyProviderExecutors,
  isAbortLikeError,
  providerUserAgent,
  ProviderRequestError,
} from "../provider-runtime.ts";

const service = "klicktipp";
const klicktippApiBaseUrl = "https://api.klicktipp.com";
const klicktippDocsUrl = "https://developers.klicktipp.com/guides/listbuilding-api";
const klicktippRequestTimeoutMs = 30_000;

type KlicktippActionContext = Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">;
type KlicktippActionHandler = (input: Record<string, unknown>, context: KlicktippActionContext) => Promise<unknown>;

export const klicktippActionHandlers: ProviderActionHandlers<"klicktipp", KlicktippActionHandler> = {
  async signin(input, context): Promise<unknown> {
    const payload = await requestKlicktippJson("/subscriber/signin", buildSigninBody(input), context);
    return {
      redirect_urls: readStringArray(payload, "KlickTipp signin redirect URLs"),
    };
  },
  async signout(input, context): Promise<unknown> {
    const payload = await requestKlicktippJson(
      "/subscriber/signout",
      { email: requiredString(input.email, "email", providerInputError) },
      context,
    );
    return normalizeBooleanResult(payload);
  },
  async signoff(input, context): Promise<unknown> {
    const payload = await requestKlicktippJson(
      "/subscriber/signoff",
      { email: requiredString(input.email, "email", providerInputError) },
      context,
    );
    return normalizeBooleanResult(payload);
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, klicktippActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input) {
    requiredString(input.apiKey, "apiKey", providerInputError);
    return {
      profile: {
        accountId: "listbuilding_api_key",
        displayName: "KlickTipp Listbuilding API Key",
      },
      grantedScopes: [],
      metadata: {
        apiBaseUrl: klicktippApiBaseUrl,
        credentialHelpUrl: klicktippDocsUrl,
        validationMode: "format_only",
      },
    };
  },
};

function buildSigninBody(input: Record<string, unknown>): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  const email = optionalString(input.email);
  const smsnumber = optionalString(input.smsnumber);
  const fields = optionalRecord(input.fields);
  if (email) {
    body.email = email;
  }
  if (smsnumber) {
    body.smsnumber = smsnumber;
  }
  if (fields) {
    body.fields = fields;
  }
  return body;
}

async function requestKlicktippJson(
  path: string,
  body: Record<string, unknown>,
  context: KlicktippActionContext,
): Promise<unknown> {
  const timeout = createProviderTimeout(context.signal, klicktippRequestTimeoutMs);
  let response: Response;
  let payload: unknown;
  try {
    response = await context.fetcher(new URL(path, klicktippApiBaseUrl), {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        "user-agent": providerUserAgent,
      },
      body: JSON.stringify({
        apikey: context.apiKey,
        ...body,
      }),
      signal: timeout.signal,
    });
    payload = await readKlicktippPayload(response);
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    if (timeout.didTimeout() || isAbortLikeError(error)) {
      throw new ProviderRequestError(504, "KlickTipp request timed out");
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `KlickTipp request failed: ${error.message}` : "KlickTipp request failed",
      error,
    );
  } finally {
    timeout.cleanup();
  }

  if (!response.ok) {
    throw createKlicktippError(response.status, payload);
  }

  return payload;
}

async function readKlicktippPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text.trim()) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    if (response.ok) {
      throw new ProviderRequestError(502, "KlickTipp returned malformed JSON");
    }
    return text;
  }
}

function createKlicktippError(status: number, payload: unknown): ProviderRequestError {
  const message = readKlicktippErrorMessage(payload) ?? `KlickTipp request failed with status ${status}`;
  const errorCode = readKlicktippErrorCode(payload);

  if (status === 401 || status === 403 || errorCode === 100) {
    return new ProviderRequestError(401, message, payload);
  }
  if (status === 400 || status === 406) {
    return new ProviderRequestError(400, message, payload);
  }
  if (status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  return new ProviderRequestError(status || 502, message, payload);
}

function readKlicktippErrorMessage(payload: unknown): string | undefined {
  if (Array.isArray(payload)) {
    const messages = payload.filter((item): item is string => typeof item === "string");
    return messages.length > 0 ? messages.join("; ") : undefined;
  }
  if (typeof payload === "string") {
    return payload.trim() || undefined;
  }

  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }

  const parts: string[] = [];
  const errorCode = readKlicktippErrorCode(record);
  if (errorCode !== undefined) {
    parts.push(`error ${errorCode}`);
  }
  const subCode = optionalNumber(record.code);
  if (subCode !== undefined) {
    parts.push(`code ${subCode}`);
  }
  appendStringPart(parts, record.field, "field");
  appendStringPart(parts, record.name, "name");
  appendStringPart(parts, record.reason, "reason");
  appendStringPart(parts, record.field_value, "field_value");
  appendStringPart(parts, record.message, "message");

  return parts.length > 0 ? `KlickTipp request failed: ${parts.join(", ")}` : undefined;
}

function readKlicktippErrorCode(payload: unknown): number | undefined {
  const record = optionalRecord(payload);
  return record ? optionalNumber(record.error) : undefined;
}

function appendStringPart(parts: string[], value: unknown, label: string): void {
  const text = optionalString(value);
  if (text) {
    parts.push(`${label} ${text}`);
  }
}

function normalizeBooleanResult(payload: unknown): Record<string, unknown> {
  const results = readBooleanArray(payload, "KlickTipp boolean result");
  return {
    success: results.length > 0 && results.every(Boolean),
    results,
  };
}

function readStringArray(value: unknown, label: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new ProviderRequestError(502, `${label} must be a string array`, value);
  }
  return value as string[];
}

function readBooleanArray(value: unknown, label: string): boolean[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "boolean")) {
    throw new ProviderRequestError(502, `${label} must be a boolean array`, value);
  }
  return value as boolean[];
}

function providerInputError(message: string): ProviderRequestError {
  return new ProviderRequestError(400, message);
}
