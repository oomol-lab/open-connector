import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext, ProviderFetch, ProviderRuntimeHandler } from "../provider-runtime.ts";

import { optionalInteger, optionalRecord, optionalString } from "../../core/cast.ts";
import { ProviderRequestError, providerUserAgent } from "../provider-runtime.ts";

const byteformsApiBaseUrl = "https://api.forms.bytesuite.io";
const validationPath = "/api/form";

interface ByteformsEnvelope<T> {
  data?: T;
  count?: unknown;
  cursor?: unknown;
  status?: unknown;
  message?: unknown;
}

type ByteformsMode = "validate" | "execute";
type ByteformsActionHandler = ProviderRuntimeHandler<ApiKeyProviderContext>;

export const byteformsActionHandlers: ProviderActionHandlers<"byteforms", ByteformsActionHandler> = {
  list_forms(_input, context) {
    return listForms(context);
  },
  get_form(input, context) {
    return getForm(input, context);
  },
  list_form_responses(input, context) {
    return listFormResponses(input, context);
  },
};

export async function validateByteformsCredential(
  apiKey: string,
  fetcher: ProviderFetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const payload = await requestByteformsJson<ByteformsEnvelope<unknown[]>>({
    apiKey,
    fetcher,
    signal,
    path: validationPath,
    mode: "validate",
  });

  return {
    profile: {
      accountId: "byteforms:api_key",
      displayName: "ByteForms API Key",
    },
    grantedScopes: [],
    metadata: {
      apiBaseUrl: byteformsApiBaseUrl,
      validationEndpoint: validationPath,
      status: typeof payload.status === "string" ? payload.status : undefined,
      formCount: Array.isArray(payload.data) ? payload.data.length : undefined,
    },
  };
}

async function listForms(context: ApiKeyProviderContext): Promise<Record<string, unknown>> {
  const payload = await requestByteformsJson<ByteformsEnvelope<unknown[]>>({
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    signal: context.signal,
    path: validationPath,
    mode: "execute",
  });

  return {
    forms: Array.isArray(payload.data) ? payload.data : [],
  };
}

async function getForm(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<Record<string, unknown>> {
  const formId = requireNonEmptyString(input.formId, "formId");
  const payload = await requestByteformsJson<ByteformsEnvelope<unknown>>({
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    signal: context.signal,
    path: `/api/form/${encodeURIComponent(formId)}`,
    mode: "execute",
  });

  return {
    form: payload.data ?? {},
  };
}

async function listFormResponses(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<Record<string, unknown>> {
  if (input.after && input.before) {
    throw new ProviderRequestError(400, "Provide either 'after' or 'before', not both");
  }
  const formId = requireNonEmptyString(input.formId, "formId");
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(input)) {
    if (key !== "formId" && value !== undefined) {
      query.set(key, String(value));
    }
  }

  const suffix = query.size > 0 ? `?${query.toString()}` : "";
  const payload = await requestByteformsJson<ByteformsEnvelope<unknown[]>>({
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    signal: context.signal,
    path: `/api/form/responses/${encodeURIComponent(formId)}${suffix}`,
    mode: "execute",
  });

  return {
    count: optionalInteger(payload.count) ?? 0,
    cursor: readCursor(payload.cursor),
    responses: Array.isArray(payload.data) ? payload.data : [],
  };
}

async function requestByteformsJson<T>(input: {
  apiKey: string;
  fetcher: ProviderFetch;
  path: string;
  mode: ByteformsMode;
  signal?: AbortSignal;
}): Promise<T> {
  const response = await input.fetcher(`${byteformsApiBaseUrl}${input.path}`, {
    method: "GET",
    headers: byteformsHeaders(input.apiKey),
    signal: input.signal,
  });

  if (!response.ok) {
    throw await createByteformsError(response, input.mode);
  }

  try {
    return (await response.json()) as T;
  } catch {
    throw new ProviderRequestError(502, "invalid ByteForms response");
  }
}

function byteformsHeaders(apiKey: string): Record<string, string> {
  return {
    accept: "application/json",
    authorization: apiKey,
    "user-agent": providerUserAgent,
  };
}

function readCursor(cursor: unknown): { after: string | null; before: string | null } {
  const record = optionalRecord(cursor);
  if (!record) {
    return {
      after: null,
      before: null,
    };
  }

  return {
    after: typeof record.after === "string" ? record.after : null,
    before: typeof record.before === "string" ? record.before : null,
  };
}

async function createByteformsError(response: Response, mode: ByteformsMode): Promise<ProviderRequestError> {
  const message = await readByteformsErrorMessage(response);

  if (mode === "validate" && (response.status === 401 || response.status === 403)) {
    return new ProviderRequestError(400, message);
  }
  return new ProviderRequestError(response.status, message);
}

async function readByteformsErrorMessage(response: Response): Promise<string> {
  const text = await response.text().catch(() => "");
  if (text) {
    try {
      const payload = JSON.parse(text) as Record<string, unknown>;
      const message = optionalString(payload.message) ?? optionalString(payload.status);
      if (message) {
        return message;
      }
    } catch {
      return text;
    }
    return text;
  }

  return `byteforms request failed with ${response.status}`;
}

function requireNonEmptyString(value: unknown, fieldName: string): string {
  const result = optionalString(value);
  if (!result) {
    throw new ProviderRequestError(400, `${fieldName} is required`);
  }
  return result;
}
