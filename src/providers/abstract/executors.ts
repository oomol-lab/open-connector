import type { CredentialValidators, ExecutionContext, ProviderExecutors } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";

import { nullableString, optionalRecord, optionalString } from "../../core/cast.ts";
import {
  defineProviderExecutors,
  providerUserAgent,
  ProviderRequestError,
  requireApiKeyCredential,
} from "../provider-runtime.ts";

const service = "abstract";
const abstractEmailValidationBaseUrl = "https://emailvalidation.abstractapi.com";
const abstractEmailValidationPath = "/v1/";

type AbstractRequestPhase = "validate" | "execute";

interface AbstractActionContext {
  apiKey: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

interface AbstractCheckResult {
  value: boolean | null;
  text: "TRUE" | "FALSE" | "UNKNOWN";
}

type AbstractActionHandler = (input: Record<string, unknown>, context: AbstractActionContext) => Promise<unknown>;

export const abstractActionHandlers: ProviderActionHandlers<"abstract", AbstractActionHandler> = {
  async validate_email(input, context): Promise<unknown> {
    const email = optionalString(input.email);
    if (!email) {
      throw new ProviderRequestError(400, "email is required");
    }

    const payload = await fetchAbstractEmailValidation(
      {
        api_key: context.apiKey,
        email,
      },
      context,
      "execute",
    );

    return normalizeEmailValidationPayload(payload);
  },
};

export const executors: ProviderExecutors = defineProviderExecutors<AbstractActionContext>({
  service,
  handlers: abstractActionHandlers,
  async createContext(context: ExecutionContext, fetcher: typeof fetch): Promise<AbstractActionContext> {
    const credential = await requireApiKeyCredential(context, service);
    return {
      apiKey: credential.apiKey,
      fetcher,
      signal: context.signal,
    };
  },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    await fetchAbstractEmailValidation(
      {
        api_key: input.apiKey,
        email: "test@example.com",
      },
      {
        apiKey: input.apiKey,
        fetcher,
        signal,
      },
      "validate",
    );

    return {
      profile: {
        accountId: "api_key",
        displayName: "Abstract Email Validation API Key",
      },
      grantedScopes: [],
      metadata: {
        apiBaseUrl: abstractEmailValidationBaseUrl,
        validationEndpoint: abstractEmailValidationPath,
      },
    };
  },
};

async function fetchAbstractEmailValidation(
  query: Record<string, string>,
  context: AbstractActionContext,
  phase: AbstractRequestPhase,
): Promise<unknown> {
  const url = new URL(abstractEmailValidationPath, abstractEmailValidationBaseUrl);
  for (const [key, value] of Object.entries(query)) {
    url.searchParams.set(key, value);
  }

  let response: Response;
  let payload: unknown;
  try {
    response = await context.fetcher(url, {
      method: "GET",
      headers: {
        accept: "application/json",
        "user-agent": providerUserAgent,
      },
      signal: context.signal,
    });
    payload = await readAbstractPayload(response);
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `abstract request failed: ${error.message}` : "abstract request failed",
    );
  }

  if (!response.ok) {
    throw createAbstractError(response, payload, phase);
  }

  return payload;
}

async function readAbstractPayload(response: Response): Promise<unknown> {
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

function createAbstractError(response: Response, payload: unknown, phase: AbstractRequestPhase): ProviderRequestError {
  const message = extractAbstractErrorMessage(payload) ?? response.statusText ?? "abstract request failed";

  if (response.status === 429) {
    return new ProviderRequestError(429, message, payload);
  }

  if (phase === "validate" && (response.status === 401 || response.status === 403)) {
    return new ProviderRequestError(400, message, payload);
  }

  return new ProviderRequestError(response.status || 502, message, payload);
}

function extractAbstractErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim()) {
    return payload;
  }

  const object = optionalRecord(payload);
  if (!object) {
    return undefined;
  }

  const error = optionalRecord(object.error);
  return optionalString(error?.message) ?? optionalString(object.message) ?? optionalString(object.error);
}

function normalizeEmailValidationPayload(payload: unknown): Record<string, unknown> {
  const object = readObject(payload, "email validation response");
  return {
    email: readString(object, "email"),
    autocorrect: nullableString(object.autocorrect) ?? null,
    deliverability: readString(object, "deliverability"),
    qualityScore: readNumber(object, "quality_score"),
    isValidFormat: readCheckResult(object, "is_valid_format"),
    isFreeEmail: readCheckResult(object, "is_free_email"),
    isDisposableEmail: readCheckResult(object, "is_disposable_email"),
    isRoleEmail: readCheckResult(object, "is_role_email"),
    isCatchallEmail: readCheckResult(object, "is_catchall_email"),
    isMxFound: readCheckResult(object, "is_mx_found"),
    isSmtpValid: readCheckResult(object, "is_smtp_valid"),
    raw: object,
  };
}

function readCheckResult(input: Record<string, unknown>, fieldName: string): AbstractCheckResult {
  const object = readObject(input[fieldName], fieldName);
  const text = readString(object, "text");
  if (text !== "TRUE" && text !== "FALSE" && text !== "UNKNOWN") {
    throw new ProviderRequestError(502, `invalid abstract ${fieldName}.text response`);
  }

  const value = object.value;
  if (value !== true && value !== false && value !== null) {
    throw new ProviderRequestError(502, `invalid abstract ${fieldName}.value response`);
  }

  return {
    value,
    text,
  };
}

function readString(input: Record<string, unknown>, fieldName: string): string {
  const value = optionalString(input[fieldName]);
  if (value === undefined) {
    throw new ProviderRequestError(502, `invalid abstract ${fieldName} response`);
  }

  return value;
}

function readNumber(input: Record<string, unknown>, fieldName: string): number {
  const value = input[fieldName];
  if (typeof value !== "number" || Number.isNaN(value)) {
    throw new ProviderRequestError(502, `invalid abstract ${fieldName} response`);
  }

  return value;
}

function readObject(value: unknown, label: string): Record<string, unknown> {
  const object = optionalRecord(value);
  if (!object) {
    throw new ProviderRequestError(502, `invalid abstract ${label} response`);
  }

  return object;
}
