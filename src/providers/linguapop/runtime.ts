import type { CredentialValidationResult } from "../../core/types.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";
import type { LinguapopActionName } from "./actions.ts";

import { compactObject, optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import { providerUserAgent, ProviderRequestError } from "../provider-runtime.ts";

export const linguapopApiBaseUrl = "https://app.linguapop.eu";
const getLanguagesPath = "/api/actions/getLanguages";
const sendInvitationPath = "/api/actions/sendInvitation";

type LinguapopActionContext = ApiKeyProviderContext;
type LinguapopActionHandler = (input: Record<string, unknown>, context: LinguapopActionContext) => Promise<unknown>;
type LinguapopRequestPhase = "validate" | "execute";

export const linguapopActionHandlers: Record<LinguapopActionName, LinguapopActionHandler> = {
  async list_available_languages(_input, context) {
    return {
      languages: await fetchAvailableLanguages(context.fetcher, "execute", context.signal),
    };
  },
  send_invitation(input, context) {
    return sendInvitation(input, context);
  },
};

export async function validateLinguapopCredential(
  apiKey: string,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const normalizedApiKey = apiKey.trim();
  if (!normalizedApiKey) {
    throw new ProviderRequestError(400, "linguapop apiKey is required");
  }

  const languages = await fetchAvailableLanguages(fetcher, "validate", signal);
  return {
    profile: {
      accountId: "linguapop:integration-api-key",
      displayName: "Linguapop Integration API Key",
      grantedScopes: [],
    },
    grantedScopes: [],
    metadata: {
      apiBaseUrl: linguapopApiBaseUrl,
      validationEndpoint: getLanguagesPath,
      validationMode: "format_and_public_endpoint",
      languageCount: languages.length,
    },
  };
}

async function sendInvitation(input: Record<string, unknown>, context: LinguapopActionContext): Promise<unknown> {
  const payload = await requestLinguapop(
    sendInvitationPath,
    {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        "user-agent": providerUserAgent,
      },
      body: JSON.stringify(
        compactObject({
          apiKey: context.apiKey,
          externalIdentifier: optionalString(input.externalIdentifier),
          name: optionalString(input.name),
          email: requiredString(input.email, "email", providerInputError),
          languageCode: requiredString(input.languageCode, "languageCode", providerInputError),
          sendEmail: input.sendEmail,
          generateKioskCode: input.generateKioskCode,
          testReading: input.testReading,
          testListening: input.testListening,
          callbackUrl: optionalString(input.callbackUrl),
          returnUrl: optionalString(input.returnUrl),
        }),
      ),
      signal: context.signal,
    },
    context.fetcher,
    "execute",
  );

  return normalizeInvitation(payload);
}

async function fetchAvailableLanguages(
  fetcher: typeof fetch,
  phase: LinguapopRequestPhase,
  signal?: AbortSignal,
): Promise<Array<{ name: string; code: string }>> {
  const payload = await requestLinguapop(
    getLanguagesPath,
    {
      method: "GET",
      headers: {
        accept: "application/json",
        "user-agent": providerUserAgent,
      },
      signal,
    },
    fetcher,
    phase,
  );

  if (!Array.isArray(payload)) {
    throw new ProviderRequestError(502, "linguapop languages response must be an array");
  }
  return payload.map((item, index) => normalizeLanguage(item, index));
}

async function requestLinguapop(
  path: string,
  init: RequestInit,
  fetcher: typeof fetch,
  phase: LinguapopRequestPhase,
): Promise<unknown> {
  let response: Response;
  try {
    response = await fetcher(new URL(path, linguapopApiBaseUrl), init);
  } catch (error) {
    throw new ProviderRequestError(
      502,
      `linguapop request failed: ${error instanceof Error ? error.message : "Unknown transport error"}`,
    );
  }

  const payload = await readLinguapopPayload(response);
  if (!response.ok) {
    throw mapLinguapopError(response.status, readLinguapopMessage(payload, response.status), phase);
  }
  return payload;
}

async function readLinguapopPayload(response: Response): Promise<unknown> {
  const text = await response.text().catch(() => "");
  if (!text.trim()) {
    return null;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    if (response.ok) {
      throw new ProviderRequestError(502, "linguapop returned malformed JSON");
    }
    return { message: text };
  }
}

function normalizeLanguage(value: unknown, index: number): { name: string; code: string } {
  const record = optionalRecord(value);
  if (!record) {
    throw new ProviderRequestError(502, `linguapop language at index ${index} must be an object`);
  }
  return {
    name: requiredString(record.name, `languages[${index}].name`, providerResponseError),
    code: requiredString(record.code, `languages[${index}].code`, providerResponseError),
  };
}

function normalizeInvitation(value: unknown): Record<string, unknown> {
  const record = optionalRecord(value);
  if (!record) {
    throw new ProviderRequestError(502, "linguapop invitation response must be an object");
  }
  return {
    invitationId: readRequiredInteger(record.invitationId, "invitationId"),
    externalIdentifier: readNullableString(record.externalIdentifier, "externalIdentifier"),
    url: requiredString(record.url, "url", providerResponseError),
    emailSent: readRequiredBoolean(record.emailSent, "emailSent"),
    kioskCode: readNullableString(record.kioskCode, "kioskCode"),
  };
}

function readLinguapopMessage(payload: unknown, status: number): string {
  if (typeof payload === "string" && payload.trim()) {
    return payload;
  }
  const record = optionalRecord(payload);
  const message = optionalString(record?.message) ?? optionalString(record?.error);
  if (message) {
    return message;
  }
  if (Array.isArray(record?.errors)) {
    const firstString = record.errors.find((item): item is string => typeof item === "string");
    if (firstString?.trim()) {
      return firstString;
    }
  }
  return `linguapop request failed with ${status}`;
}

function mapLinguapopError(status: number, message: string, phase: LinguapopRequestPhase): ProviderRequestError {
  if (status === 429) {
    return new ProviderRequestError(429, message);
  }
  if (phase === "validate") {
    return new ProviderRequestError(status >= 500 ? status : 502, message);
  }
  if (status === 401 || status === 403) {
    return new ProviderRequestError(401, message);
  }
  if (status >= 400 && status < 500) {
    return new ProviderRequestError(400, message);
  }
  return new ProviderRequestError(status || 502, message);
}

function readNullableString(value: unknown, fieldName: string): string | null {
  if (value == null) {
    return null;
  }
  if (typeof value === "string") {
    return value;
  }
  throw new ProviderRequestError(502, `linguapop response field ${fieldName} must be a string or null`);
}

function readRequiredBoolean(value: unknown, fieldName: string): boolean {
  if (typeof value === "boolean") {
    return value;
  }
  throw new ProviderRequestError(502, `linguapop response field ${fieldName} must be a boolean`);
}

function readRequiredInteger(value: unknown, fieldName: string): number {
  if (typeof value === "number" && Number.isInteger(value)) {
    return value;
  }
  throw new ProviderRequestError(502, `linguapop response field ${fieldName} must be an integer`);
}

function providerInputError(message: string): ProviderRequestError {
  return new ProviderRequestError(400, message);
}

function providerResponseError(message: string): ProviderRequestError {
  return new ProviderRequestError(502, `linguapop response field ${message} must be a string`);
}
