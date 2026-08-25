import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { compactObject, optionalRecord, optionalString } from "../../core/cast.ts";
import { ProviderRequestError, providerUserAgent } from "../provider-runtime.ts";

const googleRoutesApiBaseUrl = "https://routes.googleapis.com";

type GoogleRoutesRequestPhase = "validate" | "execute";
type GoogleRoutesActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

export const googleRoutesActionHandlers: ProviderActionHandlers<"google_routes", GoogleRoutesActionHandler> = {
  compute_routes(input, context) {
    const { fieldMask, body } = prepareGoogleRoutesBody(input);
    return googleRoutesRequest("/directions/v2:computeRoutes", fieldMask, body, context, "execute");
  },
  compute_route_matrix(input, context) {
    const { fieldMask, body } = prepareGoogleRoutesBody(input);
    if (!fieldMaskIncludes(fieldMask, "status")) {
      throw new ProviderRequestError(400, "fieldMask for compute_route_matrix must include status");
    }

    return googleRoutesRequest("/distanceMatrix/v2:computeRouteMatrix", fieldMask, body, context, "execute");
  },
};

export async function validateGoogleRoutesCredential(
  input: { apiKey: string },
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  await googleRoutesRequest(
    "/directions/v2:computeRoutes",
    "routes.distanceMeters,routes.duration",
    {
      origin: {
        location: {
          latLng: {
            latitude: 37.419734,
            longitude: -122.0827784,
          },
        },
      },
      destination: {
        location: {
          latLng: {
            latitude: 37.41767,
            longitude: -122.079595,
          },
        },
      },
      travelMode: "DRIVE",
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
      accountId: "google_routes",
      displayName: "Google Routes API Key",
    },
    grantedScopes: [],
    metadata: compactObject({
      apiBaseUrl: googleRoutesApiBaseUrl,
      validationEndpoint: "/directions/v2:computeRoutes",
    }),
  };
}

function prepareGoogleRoutesBody(input: Record<string, unknown>): { fieldMask: string; body: Record<string, unknown> } {
  const fieldMask = optionalString(input.fieldMask)?.trim();
  if (!fieldMask) {
    throw new ProviderRequestError(400, "fieldMask is required");
  }

  const { fieldMask: _fieldMask, ...body } = input;
  return {
    fieldMask,
    body,
  };
}

async function googleRoutesRequest(
  path: string,
  fieldMask: string,
  body: Record<string, unknown>,
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">,
  phase: GoogleRoutesRequestPhase,
): Promise<unknown> {
  const url = new URL(path, googleRoutesApiBaseUrl);

  let response: Response;
  let payload: unknown;
  try {
    response = await context.fetcher(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "user-agent": providerUserAgent,
        "x-goog-api-key": context.apiKey,
        "x-goog-fieldmask": fieldMask,
      },
      body: JSON.stringify(body),
      signal: context.signal,
    });
    payload = await readGoogleRoutesPayload(response);
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Google Routes request failed: ${error.message}` : "Google Routes request failed",
    );
  }

  if (!response.ok) {
    throw createGoogleRoutesError(response.status, payload, phase);
  }

  return payload ?? {};
}

async function readGoogleRoutesPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "Google Routes returned invalid JSON");
  }
}

function createGoogleRoutesError(
  status: number,
  payload: unknown,
  phase: GoogleRoutesRequestPhase,
): ProviderRequestError {
  const message = extractGoogleRoutesMessage(payload) ?? `Google Routes request failed with ${status || 500}`;

  if (status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if (phase === "validate" && (status === 400 || status === 401 || status === 403)) {
    return new ProviderRequestError(400, message, payload);
  }
  if (phase === "execute" && (status === 401 || status === 403)) {
    return new ProviderRequestError(status, message, payload);
  }
  if (status === 400 || status === 422) {
    return new ProviderRequestError(400, message, payload);
  }

  return new ProviderRequestError(status || 502, message, payload);
}

function extractGoogleRoutesMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim() !== "") {
    return payload;
  }

  const record = optionalRecord(payload);
  const error = optionalRecord(record?.error);

  return optionalString(error?.message) ?? optionalString(record?.message);
}

function fieldMaskIncludes(fieldMask: string, field: string): boolean {
  const trimmed = fieldMask.trim();
  if (trimmed === "*") {
    return true;
  }

  return trimmed
    .split(",")
    .map((part) => part.trim())
    .some((part) => part === field);
}
