import { compactObject, optionalInteger, optionalRecord, optionalString } from "../../core/cast.ts";
import { ProviderRequestError, providerUserAgent } from "../provider-runtime.ts";
export const humaansApiBaseUrl = "https://app.humaans.io/api";
export const humaansValidationPath = "/token-info";

type HumaansRequestPhase = "validate" | "execute";
type HumaansQueryValue = string | number | undefined;

interface HumaansActionContext {
  apiKey: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

interface HumaansRequestOptions {
  path: string;
  apiKey: string;
  fetcher: typeof fetch;
  phase: HumaansRequestPhase;
  inputErrorStatuses?: readonly number[];
  query?: Record<string, HumaansQueryValue>;
  signal?: AbortSignal;
}

type HumaansActionHandler = (input: Record<string, unknown>, context: HumaansActionContext) => Promise<unknown>;

export const humaansActionHandlers: Record<string, HumaansActionHandler> = {
  async get_token_info(_input, context) {
    const payload = await requestHumaansJson({
      path: humaansValidationPath,
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      phase: "execute",
      signal: context.signal,
    });
    return { scopes: readScopes(payload) };
  },
  async get_current_person(_input, context) {
    const payload = await requestHumaansJson({
      path: "/me",
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      phase: "execute",
      signal: context.signal,
    });
    return { person: requireObjectPayload(payload, "person") };
  },
  async list_people(input, context) {
    const payload = await requestHumaansJson({
      path: "/people",
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      phase: "execute",
      inputErrorStatuses: [422],
      query: buildPeopleQuery(input),
      signal: context.signal,
    });
    return normalizePeoplePage(payload);
  },
  async get_person(input, context) {
    const personId = requireNonEmptyString(input.personId, "personId");
    const payload = await requestHumaansJson({
      path: `/people/${encodeURIComponent(personId)}`,
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      phase: "execute",
      inputErrorStatuses: [404],
      signal: context.signal,
    });
    return { person: requireObjectPayload(payload, "person") };
  },
};

export async function validateHumaansCredential(
  apiKey: string,
  fetcher: typeof fetch,
): Promise<import("../../core/types.ts").CredentialValidationResult> {
  const payload = await requestHumaansJson({
    path: humaansValidationPath,
    apiKey,
    fetcher,
    phase: "validate",
  });
  const scopes = readScopes(payload);

  return {
    profile: { accountId: "humaans:api-token", displayName: "Humaans API Access Token" },
    grantedScopes: scopes,
    metadata: {
      apiBaseUrl: humaansApiBaseUrl,
      validationEndpoint: humaansValidationPath,
    },
  };
}

function buildPeopleQuery(input: Record<string, unknown>) {
  return compactObject({
    firstName: optionalString(input.firstName),
    lastName: optionalString(input.lastName),
    preferredName: optionalString(input.preferredName),
    email: optionalString(input.email),
    personalEmail: optionalString(input.personalEmail),
    spaceId: optionalString(input.spaceId),
    teams: optionalString(input.teamId),
    status: optionalString(input.status),
    $limit: optionalInteger(input.limit),
    $skip: optionalInteger(input.skip),
  });
}

async function requestHumaansJson(options: HumaansRequestOptions) {
  const url = new URL(`${humaansApiBaseUrl}${options.path}`);
  for (const [key, value] of Object.entries(options.query ?? {})) {
    if (value !== undefined) url.searchParams.set(key, String(value));
  }

  let response: Response;
  try {
    response = await options.fetcher(url, {
      method: "GET",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${options.apiKey}`,
        "user-agent": providerUserAgent,
      },
      signal: options.signal,
    });
  } catch (error) {
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Humaans API request failed: ${error.message}` : "Humaans API request failed",
    );
  }

  const payload = await readResponsePayload(response);
  if (!response.ok) {
    throw mapHumaansError(response.status, payload, options.phase, options.inputErrorStatuses ?? []);
  }
  return payload;
}

async function readResponsePayload(response: Response) {
  const text = await response.text();
  if (!text.trim()) return null;

  try {
    return JSON.parse(text) as unknown;
  } catch {
    if (response.ok) {
      throw new ProviderRequestError(502, "Humaans returned invalid JSON");
    }
    return text;
  }
}

function mapHumaansError(
  status: number,
  payload: unknown,
  phase: HumaansRequestPhase,
  inputErrorStatuses: readonly number[],
) {
  const message = extractErrorMessage(payload) ?? `Humaans API request failed with status ${status}`;
  if (status === 401) {
    return phase === "validate" ? new ProviderRequestError(400, message) : new ProviderRequestError(401, message);
  }
  if (status === 403) return new ProviderRequestError(403, message);
  if (inputErrorStatuses.includes(status)) {
    return new ProviderRequestError(status === 404 ? 404 : 400, message);
  }
  if (status === 429) return new ProviderRequestError(429, message);
  return new ProviderRequestError(502, message);
}

function extractErrorMessage(payload: unknown) {
  if (typeof payload === "string" && payload.trim()) return payload.trim();
  const body = optionalRecord(payload);
  if (!body) return undefined;
  const error = body.error;
  if (typeof error === "string" && error.trim()) return error.trim();
  const errorObject = optionalRecord(error);
  return optionalString(errorObject?.message) ?? optionalString(body.message);
}

function readScopes(payload: unknown) {
  const body = requireObjectPayload(payload, "token info");
  if (!Array.isArray(body.scopes) || body.scopes.some((scope) => typeof scope !== "string")) {
    throw new ProviderRequestError(502, "Humaans returned invalid token scopes");
  }
  return body.scopes;
}

function normalizePeoplePage(payload: unknown) {
  const body = requireObjectPayload(payload, "people page");
  if (!Array.isArray(body.data)) {
    throw new ProviderRequestError(502, "Humaans returned invalid people data");
  }
  return {
    total: requireNonNegativeInteger(body.total, "total"),
    limit: requirePositiveInteger(body.limit, "limit"),
    skip: requireNonNegativeInteger(body.skip, "skip"),
    people: body.data.map((person) => requireObjectPayload(person, "person")),
  };
}

function requireObjectPayload(value: unknown, name: string) {
  const object = optionalRecord(value);
  if (!object) {
    throw new ProviderRequestError(502, `Humaans returned invalid ${name} data`);
  }
  return object;
}

function requireNonEmptyString(value: unknown, fieldName: string) {
  if (typeof value !== "string" || !value.trim()) {
    throw new ProviderRequestError(400, `${fieldName} must be a non-empty string`);
  }
  return value.trim();
}

function requireNonNegativeInteger(value: unknown, fieldName: string) {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new ProviderRequestError(502, `Humaans returned invalid ${fieldName} pagination data`);
  }
  return value;
}

function requirePositiveInteger(value: unknown, fieldName: string) {
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    throw new ProviderRequestError(502, `Humaans returned invalid ${fieldName} pagination data`);
  }
  return value;
}
