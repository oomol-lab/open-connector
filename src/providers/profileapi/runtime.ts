import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext, ProviderRuntimeHandler } from "../provider-runtime.ts";

import { createHash } from "node:crypto";
import { optionalRecord, optionalString } from "../../core/cast.ts";
import { providerUserAgent, ProviderRequestError } from "../provider-runtime.ts";

export const profileapiApiBaseUrl = "https://api.profileapi.com";
const apiVersion = "2024-03-01";
const validationPath = `/${apiVersion}/persons/find`;

async function execute(path: string, input: Record<string, unknown>, context: ApiKeyProviderContext) {
  const body = Object.fromEntries(
    Object.entries(input).map(([key, value]) => [key, typeof value === "string" ? value.trim() : value]),
  );
  return request(path, context.apiKey, body, context.fetcher, "execute");
}

export const profileapiActionHandlers: ProviderActionHandlers<
  "profileapi",
  ProviderRuntimeHandler<ApiKeyProviderContext>
> = {
  reverse_lookup_email: (input, context) => execute(`/${apiVersion}/email-contacts/reverse-lookup`, input, context),
  reverse_lookup_phone: (input, context) => execute(`/${apiVersion}/phone-contacts/reverse-lookup`, input, context),
};

export async function validateProfileapiCredential(
  apiKey: string,
  fetcher: typeof fetch,
): Promise<CredentialValidationResult> {
  const response = await fetchRequest(validationPath, apiKey, {}, fetcher);
  if (response.status !== 400) {
    const payload = await readPayload(response);
    if (!response.ok) throw mapError(response.status, payload, "validate");
  }
  const hash = createHash("sha256").update(apiKey).digest("hex").slice(0, 16);
  return {
    profile: { accountId: `profileapi:${hash}`, displayName: "profileAPI API Key" },
    grantedScopes: [],
    metadata: { apiBaseUrl: profileapiApiBaseUrl, apiVersion, validationEndpoint: validationPath },
  };
}

async function request(
  path: string,
  apiKey: string,
  body: Record<string, unknown>,
  fetcher: typeof fetch,
  phase: "validate" | "execute",
) {
  const response = await fetchRequest(path, apiKey, body, fetcher);
  const payload = await readPayload(response);
  if (!response.ok) throw mapError(response.status, payload, phase);
  return payload;
}

async function fetchRequest(path: string, apiKey: string, body: Record<string, unknown>, fetcher: typeof fetch) {
  try {
    return await fetcher(new URL(path, profileapiApiBaseUrl), {
      method: "POST",
      headers: {
        accept: "application/json",
        authorization: `ApiKey ${apiKey}`,
        "content-type": "application/json",
        "user-agent": providerUserAgent,
      },
      body: JSON.stringify(body),
    });
  } catch (error) {
    throw new ProviderRequestError(
      502,
      `profileAPI request failed: ${error instanceof Error ? error.message : "Unknown transport error"}`,
    );
  }
}

async function readPayload(response: Response) {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    if (response.ok) throw new ProviderRequestError(502, "profileAPI returned malformed JSON");
    return { message: text };
  }
}

function mapError(status: number, payload: unknown, phase: "validate" | "execute") {
  const body = optionalRecord(payload);
  const nested = optionalRecord(body?.error);
  const message =
    optionalString(body?.message) ??
    optionalString(body?.error) ??
    optionalString(nested?.message) ??
    "profileAPI request failed";
  if (status === 401 || status === 403) return new ProviderRequestError(phase === "validate" ? 400 : status, message);
  if (status === 429) return new ProviderRequestError(429, message);
  if (status >= 400 && status < 500) return new ProviderRequestError(status, message);
  return new ProviderRequestError(status || 502, message);
}
