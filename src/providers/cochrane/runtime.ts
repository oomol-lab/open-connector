import { Buffer } from "node:buffer";
import { optionalRecord, optionalString } from "../../core/cast.ts";
import { createProviderTimeout, providerUserAgent, ProviderRequestError } from "../provider-runtime.ts";

const cochraneApiBaseUrl = "https://archie.cochrane.org";

interface CochraneCredential {
  authMethod: "basic" | "bearer";
  username?: string;
  password?: string;
  bearerToken?: string;
}

interface CochraneRequestInput {
  credential: CochraneCredential;
  path: string;
  fetcher: typeof fetch;
  phase: "validate" | "execute";
}

export async function validateCochraneCredential(
  values: Record<string, string>,
  fetcher: typeof fetch,
): Promise<{ profile: { displayName: string }; grantedScopes: string[]; metadata: Record<string, unknown> }> {
  const credential = readCochraneCredential(values);
  await requestCochrane({
    credential,
    path: "/rest/reviews?myRole=Author&published=false",
    fetcher,
    phase: "validate",
  });

  return {
    profile: {
      displayName:
        credential.authMethod == "basic" ? (credential.username ?? "Cochrane Account") : "Cochrane Bearer Account",
    },
    grantedScopes: [],
    metadata: {
      apiBaseUrl: cochraneApiBaseUrl,
      authMethod: credential.authMethod,
    },
  };
}

export async function executeCochraneAction(
  actionName: string,
  input: Record<string, unknown>,
  values: Record<string, string>,
  fetcher: typeof fetch,
): Promise<unknown> {
  const credential = readCochraneCredential(values);
  const reviewId = encodeURIComponent(requireInputString(input, "reviewId"));
  if (actionName == "get_review_metadata")
    return {
      metadata: await requestCochraneJson({
        credential,
        path: `/rest/reviews/${reviewId}/metadata`,
        fetcher,
        phase: "execute",
      }),
    };
  if (actionName == "list_review_versions")
    return {
      versions: await requestCochraneJson({
        credential,
        path: `/rest/reviews/${reviewId}/versions`,
        fetcher,
        phase: "execute",
      }),
    };
  if (actionName == "get_review_roles")
    return {
      roles: await requestCochraneJson({
        credential,
        path: `/rest/reviews/${reviewId}/roles`,
        fetcher,
        phase: "execute",
      }),
    };
  if (actionName == "list_review_translations") {
    const version = readOptionalInputString(input, "version");
    const versionPath = version ? `/${encodeURIComponent(version)}` : "";
    return {
      translations: readObjectArray(
        await requestCochraneJson({
          credential,
          path: `/rest/reviews/${reviewId}${versionPath}/translations`,
          fetcher,
          phase: "execute",
        }),
        "translations",
      ),
    };
  }
  throw new ProviderRequestError(500, `cochrane action is not implemented: ${actionName}`);
}

export function applyCochraneAuthorization(headers: Headers, values: Record<string, string>): void {
  const credential = readCochraneCredential(values);
  if (credential.authMethod == "bearer") {
    headers.set("authorization", `Bearer ${credential.bearerToken}`);
    return;
  }
  headers.set(
    "authorization",
    `Basic ${Buffer.from(`${credential.username}:${credential.password}`).toString("base64")}`,
  );
}

function readCochraneCredential(values: Record<string, string>): CochraneCredential {
  const authMethod = values.authMethod?.trim().toLowerCase();
  if (authMethod == "bearer") {
    const bearerToken = values.bearerToken?.trim();
    if (!bearerToken) {
      throw new ProviderRequestError(400, "Cochrane bearerToken is required");
    }
    return { authMethod, bearerToken };
  }
  if (authMethod == "basic") {
    const username = values.username?.trim();
    const password = values.password;
    if (!username || !password) {
      throw new ProviderRequestError(400, "Cochrane username and password are required for Basic authentication");
    }
    return { authMethod, username, password };
  }
  throw new ProviderRequestError(400, "Cochrane authMethod must be basic or bearer");
}

async function requestCochraneJson(input: CochraneRequestInput) {
  const response = await requestCochrane(input);
  const text = await response.text();
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "Cochrane returned invalid JSON");
  }
}

async function requestCochrane(input: CochraneRequestInput) {
  const timeoutHandle = createProviderTimeout(undefined);
  const headers = new Headers({
    accept: input.phase == "validate" ? "application/xml;charset=utf-8" : "application/json",
    "user-agent": providerUserAgent,
  });
  applyCochraneAuthorization(headers, credentialValues(input.credential));

  try {
    const response = await input.fetcher(new URL(input.path, cochraneApiBaseUrl), {
      method: "GET",
      headers,
      signal: timeoutHandle.signal,
    });
    if (!response.ok) {
      throw createCochraneError(response, input.phase);
    }
    return response;
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Cochrane request failed: ${error.message}` : "Cochrane request failed",
    );
  } finally {
    timeoutHandle.cleanup();
  }
}

function credentialValues(credential: CochraneCredential): Record<string, string> {
  return {
    authMethod: credential.authMethod,
    username: credential.username ?? "",
    password: credential.password ?? "",
    bearerToken: credential.bearerToken ?? "",
  };
}

function createCochraneError(response: Response, phase: CochraneRequestInput["phase"]) {
  const message = `Cochrane request failed with status ${response.status}`;
  if (response.status == 401) {
    return new ProviderRequestError(phase == "validate" ? 400 : 401, message);
  }
  if (response.status == 429) {
    return new ProviderRequestError(429, message);
  }
  return new ProviderRequestError(400, message, response.status);
}

function requireInputString(input: Record<string, unknown>, field: string) {
  const value = optionalString(input[field])?.trim();
  if (!value) {
    throw new ProviderRequestError(400, `Cochrane ${field} is required`);
  }
  return value;
}

function readOptionalInputString(input: Record<string, unknown>, field: string) {
  const value = optionalString(input[field]);
  if (value === undefined) {
    return undefined;
  }
  const trimmedValue = value.trim();
  if (!trimmedValue) {
    throw new ProviderRequestError(400, `Cochrane ${field} cannot be empty`);
  }
  return trimmedValue;
}

function readObjectArray(value: unknown, field: string) {
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(502, `Cochrane ${field} response is not an array`);
  }
  const records = value.map(optionalRecord);
  if (records.some((record) => !record)) {
    throw new ProviderRequestError(502, `Cochrane ${field} response contains a non-object`);
  }
  return records;
}
