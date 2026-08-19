import type { ProviderActionHandlers } from "../provider-runtime.ts";

import { requiredString } from "../../core/cast.ts";
import { ProviderRequestError, providerUserAgent } from "../provider-runtime.ts";

export interface ReversecontactCredentialCheck {
  providerAccountId?: string;
  accountLabel: string;
  providerScopes: string[];
  providerMetadata: Record<string, unknown>;
}

export const reversecontactApiBaseUrl = "https://api.reversecontact.com";
const usagePath = "/v2/usage";
const personEnrichmentPath = "/v2/enrich/persons";
const companyEnrichmentPath = "/v2/enrich/companies";

type ReversecontactActionHandler = (input: ApiKeyProviderActionInput, fetcher: typeof fetch) => Promise<unknown>;

interface ApiKeyProviderActionInput {
  apiKey: string;
  actionName: string;
  input: Record<string, unknown>;
}

export const reversecontactActionHandlers: ProviderActionHandlers<"reversecontact", ReversecontactActionHandler> = {
  enrich_person(input, fetcher) {
    const body = normalizePersonInput(input.input);
    return requestReversecontact(personEnrichmentPath, "POST", input.apiKey, body, fetcher);
  },
  enrich_company(input, fetcher) {
    const body = { ...input.input };
    if (typeof body.domain === "string") body.domain = body.domain.trim();
    return requestReversecontact(companyEnrichmentPath, "POST", input.apiKey, body, fetcher);
  },
};

function normalizePersonInput(input: Record<string, unknown>): Record<string, unknown> {
  const fields = ["email", "firstName", "lastName", "companyDomain", "companyName"] as const;
  const body = { ...input };
  let hasIdentifier = false;
  for (const field of fields) {
    if (typeof input[field] === "string") {
      const value = input[field].trim();
      if (value) {
        body[field] = value;
        hasIdentifier = true;
      }
    }
  }
  if (!hasIdentifier) {
    throw new ProviderRequestError(
      400,
      "At least one of email, firstName, lastName, companyDomain, or companyName is required.",
    );
  }
  return body;
}

export async function validateReversecontactCredential(
  input: Record<string, string>,
  fetcher: typeof fetch,
): Promise<ReversecontactCredentialCheck> {
  await requestReversecontact(usagePath, "GET", requiredString(input.apiKey, "apiKey"), undefined, fetcher);
  return {
    accountLabel: "Reverse Contact API Key",
    providerScopes: [],
    providerMetadata: { apiBaseUrl: reversecontactApiBaseUrl, validationEndpoint: usagePath },
  };
}

async function requestReversecontact(
  path: string,
  method: "GET" | "POST",
  apiKey: string,
  body: Record<string, unknown> | undefined,
  fetcher: typeof fetch,
) {
  let response: Response;
  try {
    response = await fetcher(new URL(path, reversecontactApiBaseUrl), {
      method,
      headers: {
        accept: "application/json",
        authorization: `Bearer ${apiKey}`,
        ...(body ? { "content-type": "application/json" } : {}),
        "user-agent": providerUserAgent,
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (error) {
    throw new ProviderRequestError(
      502,
      `reversecontact request failed: ${error instanceof Error ? error.message : "Unknown transport error"}`,
    );
  }

  const payload = await readReversecontactPayload(response);
  if (!response.ok) {
    throw mapReversecontactError(response.status, readReversecontactMessage(payload));
  }
  return payload;
}

async function readReversecontactPayload(response: Response) {
  const text = await response.text();
  if (!text) return {};

  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    if (response.ok) {
      throw new ProviderRequestError(502, "reversecontact returned malformed JSON");
    }
    return { message: text };
  }
}

function readReversecontactMessage(payload: Record<string, unknown>) {
  if (typeof payload.message === "string") return payload.message;
  if (typeof payload.error === "string") return payload.error;
  if (payload.error && typeof payload.error === "object" && !Array.isArray(payload.error)) {
    const error = payload.error as Record<string, unknown>;
    if (typeof error.message === "string") return error.message;
    if (typeof error.code === "string") return error.code;
  }
  return "reversecontact request failed";
}

function mapReversecontactError(status: number, message: string) {
  if (status === 401 || status === 403) {
    return new ProviderRequestError(409, message);
  }
  if (status === 429) {
    return new ProviderRequestError(429, message);
  }
  if (status >= 400 && status < 500) {
    return new ProviderRequestError(400, message);
  }
  return new ProviderRequestError(502, message);
}
