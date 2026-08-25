import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { compactObject, optionalRecord, optionalString } from "../../core/cast.ts";
import { ProviderRequestError, providerUserAgent } from "../provider-runtime.ts";

const googleAddressValidationApiBaseUrl = "https://addressvalidation.googleapis.com";

type GoogleAddressValidationActionHandler = (
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
) => Promise<unknown>;

export const googleAddressValidationActionHandlers: ProviderActionHandlers<
  "google_address_validation",
  GoogleAddressValidationActionHandler
> = {
  validate_address(input, context) {
    return googleAddressValidationRequest("/v1:validateAddress", input, context);
  },
  provide_validation_feedback(input, context) {
    return googleAddressValidationRequest("/v1:provideValidationFeedback", input, context);
  },
};

export async function validateGoogleAddressValidationCredential(
  input: { apiKey: string },
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  await googleAddressValidationRequest(
    "/v1:validateAddress",
    {
      address: {
        regionCode: "US",
        addressLines: ["1600 Amphitheatre Pkwy"],
        locality: "Mountain View",
        administrativeArea: "CA",
        postalCode: "94043",
      },
    },
    {
      apiKey: input.apiKey,
      fetcher,
      signal,
    },
  );

  return {
    profile: {
      accountId: "google_address_validation",
      displayName: "Google Address Validation API Key",
    },
    grantedScopes: [],
    metadata: compactObject({
      apiBaseUrl: googleAddressValidationApiBaseUrl,
      validationEndpoint: "/v1:validateAddress",
    }),
  };
}

async function googleAddressValidationRequest(
  path: string,
  body: Record<string, unknown>,
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">,
): Promise<Record<string, unknown>> {
  const url = new URL(path, googleAddressValidationApiBaseUrl);
  url.searchParams.set("key", context.apiKey);

  let response: Response;
  let payload: unknown;
  try {
    response = await context.fetcher(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "user-agent": providerUserAgent,
      },
      body: JSON.stringify(body),
      signal: context.signal,
    });
    payload = await readGoogleAddressValidationPayload(response);
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error
        ? `Google Address Validation request failed: ${error.message}`
        : "Google Address Validation request failed",
    );
  }

  if (!response.ok) {
    throw createGoogleAddressValidationError(response.status, payload);
  }

  if (payload == null) {
    return {};
  }

  return requireObject(payload, "Google Address Validation response");
}

async function readGoogleAddressValidationPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "Google Address Validation returned invalid JSON");
  }
}

function createGoogleAddressValidationError(status: number, payload: unknown): ProviderRequestError {
  const message =
    extractGoogleAddressValidationMessage(payload) ?? `Google Address Validation request failed with ${status || 500}`;

  if (status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if (status === 400 || status === 401 || status === 403) {
    return new ProviderRequestError(400, message, payload);
  }

  return new ProviderRequestError(status || 502, message, payload);
}

function extractGoogleAddressValidationMessage(payload: unknown): string | undefined {
  const record = optionalRecord(payload);
  const error = optionalRecord(record?.error);

  return optionalString(error?.message) ?? optionalString(record?.message);
}

function requireObject(value: unknown, label: string): Record<string, unknown> {
  const record = optionalRecord(value);
  if (!record) {
    throw new ProviderRequestError(502, `${label} must be an object`);
  }
  return record;
}
