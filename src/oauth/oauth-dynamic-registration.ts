import { optionalString, requiredString } from "../core/cast.ts";
import { readBoundedResponseBytes } from "../core/request.ts";
import { providerFetch } from "../providers/provider-runtime.ts";

const registrationRequestTimeoutMs = 30_000;
const registrationResponseMaxBytes = 256 * 1024;

class DynamicRegistrationResponseSizeError extends Error {}

export interface DynamicClientRegistrationInput {
  registrationEndpoint: string;
  redirectUri: string;
  clientName: string;
  createError: (message: string) => Error;
}

export interface DynamicClientRegistrationResult {
  clientId: string;
  clientSecret?: string;
}

/**
 * Register a public OAuth client with a provider's RFC 7591 dynamic client
 * registration endpoint, requesting the same public-client, authorization-code
 * shape every `tokenEndpointAuthMethod: "none"` provider in this catalog uses.
 */
export async function registerDynamicOAuthClient(
  input: DynamicClientRegistrationInput,
): Promise<DynamicClientRegistrationResult> {
  let response: Response;
  try {
    response = await providerFetch(input.registrationEndpoint, {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        redirect_uris: [input.redirectUri],
        token_endpoint_auth_method: "none",
        grant_types: ["authorization_code", "refresh_token"],
        response_types: ["code"],
        client_name: input.clientName,
      }),
      signal: AbortSignal.timeout(registrationRequestTimeoutMs),
      redirect: "manual",
    });
  } catch (error) {
    if (error instanceof Error && error.name === "TimeoutError") {
      throw input.createError("Dynamic client registration request timed out.");
    }
    throw input.createError(
      `Dynamic client registration request failed without an HTTP response: ${describeCause(error)}`,
    );
  }

  const bytes = await readRegistrationResponseBytes(response, input.createError);
  const payload = decodeJsonObject(bytes);
  if (!response.ok) {
    const providerMessage = optionalString(payload.error_description) ?? optionalString(payload.error);
    const bodyDescription = bytes.byteLength === 0 ? "empty body" : "unrecognized response body";
    throw input.createError(
      providerMessage ?? `Dynamic client registration failed (HTTP ${response.status}, ${bodyDescription}).`,
    );
  }

  return {
    clientId: requiredString(payload.client_id, "client_id", input.createError),
    clientSecret: optionalString(payload.client_secret),
  };
}

async function readRegistrationResponseBytes(
  response: Response,
  createError: (message: string) => Error,
): Promise<Uint8Array> {
  try {
    return await readBoundedResponseBytes(response, {
      maxBytes: registrationResponseMaxBytes,
      fieldName: "Dynamic client registration response",
      createError: (message) => new DynamicRegistrationResponseSizeError(message),
    });
  } catch (error) {
    if (error instanceof DynamicRegistrationResponseSizeError) {
      throw createError(error.message);
    }
    throw createError(`Dynamic client registration failed (HTTP ${response.status}, response body could not be read).`);
  }
}

function decodeJsonObject(bytes: Uint8Array): Record<string, unknown> {
  if (bytes.byteLength === 0) {
    return {};
  }

  try {
    const payload = JSON.parse(new TextDecoder().decode(bytes)) as unknown;
    return typeof payload === "object" && payload != null && !Array.isArray(payload)
      ? (payload as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function describeCause(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
