import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { compactObject, optionalRawString, optionalString } from "../../core/cast.ts";
import { defineApiKeyProviderExecutors, providerUserAgent, ProviderRequestError } from "../provider-runtime.ts";

const service = "formcarry";
const formcarryApiBaseUrl = "https://formcarry.com";

type FormcarryRequestPhase = "validate" | "execute";
type FormcarryActionContext = ApiKeyProviderContext;
type FormcarryActionHandler = (input: Record<string, unknown>, context: FormcarryActionContext) => Promise<unknown>;

export const formcarryActionHandlers: ProviderActionHandlers<"formcarry", FormcarryActionHandler> = {
  async create_form(input, context) {
    const response = await context.fetcher(`${formcarryApiBaseUrl}/api/form`, {
      method: "PUT",
      headers: formcarryHeaders(context.apiKey, {
        "content-type": "application/x-www-form-urlencoded",
      }),
      body: buildCreateFormBody(input),
      signal: context.signal,
    });

    await assertFormcarryResponse(response, "execute");
    return readFormcarryJson(response, "invalid Formcarry create_form response");
  },
  async delete_form(input, context) {
    const response = await context.fetcher(
      `${formcarryApiBaseUrl}/api/form/${encodeURIComponent(requiredInputString(input.form_id, "form_id"))}`,
      {
        method: "DELETE",
        headers: formcarryHeaders(context.apiKey),
        signal: context.signal,
      },
    );

    await assertFormcarryResponse(response, "execute");
    return readFormcarryJson(response, "invalid Formcarry delete_form response");
  },
  async list_submissions(input, context) {
    const url = new URL(
      `/api/form/${encodeURIComponent(requiredInputString(input.form_id, "form_id"))}/submissions`,
      formcarryApiBaseUrl,
    );

    for (const [key, value] of Object.entries(input)) {
      if (key !== "form_id" && value !== undefined) {
        url.searchParams.set(key, String(value));
      }
    }

    const response = await context.fetcher(url.toString(), {
      method: "GET",
      headers: formcarryHeaders(context.apiKey),
      signal: context.signal,
    });

    await assertFormcarryResponse(response, "execute");
    return readFormcarryJson(response, "invalid Formcarry list_submissions response");
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, formcarryActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const response = await fetcher(`${formcarryApiBaseUrl}/api/auth`, {
      method: "GET",
      headers: formcarryHeaders(input.apiKey),
      signal,
    });

    await assertFormcarryResponse(response, "validate");
    const payload = await readFormcarryJson(response, "invalid Formcarry auth response");

    return {
      profile: {
        accountId: "api_key",
        displayName: "Formcarry API Key",
      },
      grantedScopes: [],
      metadata: compactObject({
        apiBaseUrl: formcarryApiBaseUrl,
        validationEndpoint: "/api/auth",
        status: optionalString(payload.status),
        message: optionalString(payload.message),
      }),
    };
  },
};

function buildCreateFormBody(input: Record<string, unknown>): string {
  const body = new URLSearchParams();

  for (const key of ["name", "email", "returnUrl", "failUrl", "googleRecaptcha", "webhook"]) {
    const value = optionalRawString(input[key]);
    if (value && value.length > 0) {
      body.set(key, value);
    }
  }

  for (const key of ["returnParams", "retention"]) {
    const value = input[key];
    if (typeof value === "boolean") {
      body.set(key, value ? "true" : "false");
    }
  }

  return body.toString();
}

function formcarryHeaders(apiKey: string, extraHeaders?: HeadersInit): Headers {
  const headers = new Headers(extraHeaders);
  headers.set("accept", "application/json");
  headers.set("api_key", apiKey);
  headers.set("user-agent", providerUserAgent);
  return headers;
}

async function assertFormcarryResponse(response: Response, phase: FormcarryRequestPhase): Promise<void> {
  if (response.ok) {
    return;
  }

  const error = await readFormcarryError(response);

  if (response.status === 429) {
    throw new ProviderRequestError(429, error.message, error.payload);
  }
  if (phase === "validate" && (response.status === 401 || response.status === 403)) {
    throw new ProviderRequestError(400, error.message, error.payload);
  }
  if (response.status === 401 || response.status === 403) {
    throw new ProviderRequestError(401, error.message, error.payload);
  }
  if (response.status === 400 || response.status === 404 || response.status === 422) {
    throw new ProviderRequestError(400, error.message, error.payload);
  }

  throw new ProviderRequestError(response.status >= 500 ? 502 : response.status || 502, error.message, error.payload);
}

async function readFormcarryJson(response: Response, message: string): Promise<Record<string, unknown>> {
  try {
    const payload = (await response.json()) as unknown;
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      throw new ProviderRequestError(502, message, payload);
    }
    return payload as Record<string, unknown>;
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    throw new ProviderRequestError(502, message, error);
  }
}

async function readFormcarryError(response: Response): Promise<{ message: string; payload: unknown }> {
  const text = await response.text().catch(() => "");
  if (!text) {
    return {
      message: `formcarry request failed with ${response.status}`,
      payload: null,
    };
  }

  try {
    const payload = JSON.parse(text) as unknown;
    return {
      message: extractFormcarryErrorMessage(payload) ?? `formcarry request failed with ${response.status}`,
      payload,
    };
  } catch {
    return {
      message: text || `formcarry request failed with ${response.status}`,
      payload: text,
    };
  }
}

function extractFormcarryErrorMessage(payload: unknown): string | undefined {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return undefined;
  }
  const record = payload as Record<string, unknown>;
  return (
    optionalString(record.message) ??
    optionalString(record.error) ??
    optionalString(record.title) ??
    optionalString(record.status)
  );
}

function requiredInputString(value: unknown, fieldName: string): string {
  const result = optionalRawString(value);
  if (!result || result.length === 0) {
    throw new ProviderRequestError(400, `${fieldName} is required`);
  }
  return result;
}
