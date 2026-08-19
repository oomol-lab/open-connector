import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { InstabotActionName } from "./actions.ts";

import { compactObject, optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import { createProviderTimeout, ProviderRequestError, providerUserAgent } from "../provider-runtime.ts";

export interface InstabotCredentialCheck {
  providerAccountId?: string;
  accountLabel: string;
  providerScopes: string[];
  providerMetadata: Record<string, unknown>;
}

interface ApiKeyProviderActionInput {
  apiKey: string;
  actionName: string;
  input: Record<string, unknown>;
  providerMetadata?: Record<string, unknown>;
  values?: Record<string, string>;
}

const instabotApiBaseUrl = "https://api.instabot.io/v1";
const instabotDefaultRequestTimeoutMs = 30_000;

type InstabotPhase = "validate" | "execute";
type InstabotCredential = {
  apiKey: string;
  masterApiKey: string;
};
type InstabotRequestInput = {
  path: string;
  method: "GET" | "POST" | "PUT" | "DELETE";
  query?: Record<string, string | undefined>;
  body?: Record<string, unknown>;
  credential: InstabotCredential;
  fetcher: typeof fetch;
  phase: InstabotPhase;
};
type InstabotActionHandler = (
  input: Record<string, unknown>,
  credential: InstabotCredential,
  fetcher: typeof fetch,
) => Promise<unknown>;

export const instabotActionHandlers: ProviderActionHandlers<"instabot", InstabotActionHandler> = {
  async create_user(input, credential, fetcher) {
    const payload = await requestInstabotJson({
      path: "/users",
      method: "POST",
      body: input,
      credential,
      fetcher,
      phase: "execute",
    });
    const data = requireObject(payload.data, "Instabot create user response is missing data");
    const userId = requirePositiveInteger(data.objectId, "Instabot create user response is missing objectId");
    return { status: normalizeStatus(payload), userId };
  },
  async get_user(input, credential, fetcher) {
    const payload = await requestInstabotJson({
      path: `/users/${readUserId(input.userId)}`,
      method: "GET",
      query: compactObject({ resolve: readResolve(input.resolve) }),
      credential,
      fetcher,
      phase: "execute",
    });
    return {
      status: normalizeStatus(payload),
      user: requireObject(payload.data, "Instabot get user response is missing data"),
    };
  },
  async list_users(input, credential, fetcher) {
    return listUsers("/users", input, credential, fetcher);
  },
  async list_updated_users(input, credential, fetcher) {
    return listUsers("/users/lastUpdated", input, credential, fetcher, readRequiredString(input.since, "since"));
  },
  async update_user(input, credential, fetcher) {
    const userId = readUserId(input.userId);
    const { userId: _userId, ...body } = input;
    if (Object.keys(body).length === 0) {
      throw new ProviderRequestError(400, "at least one writable user field is required");
    }
    const payload = await requestInstabotJson({
      path: `/users/${userId}`,
      method: "PUT",
      body,
      credential,
      fetcher,
      phase: "execute",
    });
    return { status: normalizeStatus(payload) };
  },
  async delete_user(input, credential, fetcher) {
    const payload = await requestInstabotJson({
      path: `/users/${readUserId(input.userId)}`,
      method: "DELETE",
      credential,
      fetcher,
      phase: "execute",
    });
    return { status: normalizeStatus(payload) };
  },
  async restore_user(input, credential, fetcher) {
    const payload = await requestInstabotJson({
      path: `/users/${readUserId(input.userId)}`,
      method: "POST",
      credential,
      fetcher,
      phase: "execute",
    });
    return { status: normalizeStatus(payload) };
  },
};

export async function validateInstabotCredential(
  input: Record<string, string>,
  fetcher: typeof fetch,
): Promise<InstabotCredentialCheck> {
  const payload = await requestInstabotJson({
    path: "/",
    method: "GET",
    credential: readInstabotCredential(input),
    fetcher,
    phase: "validate",
  });
  const data = optionalRecord(payload.data);
  const applicationName = optionalString(data?.applicationName)?.trim();

  return {
    accountLabel: applicationName || "Instabot API Key",
    providerScopes: [],
    providerMetadata: compactObject({
      applicationName,
      apiVersion: optionalString(data?.version)?.trim(),
      validationEndpoint: "/",
    }),
  };
}

export async function executeInstabotAction(
  input: ApiKeyProviderActionInput & {
    actionName: InstabotActionName;
    input: Record<string, unknown>;
  },
  fetcher: typeof fetch,
): Promise<unknown> {
  const handler = instabotActionHandlers[input.actionName];
  if (!handler) {
    throw new ProviderRequestError(500, `instabot action is not implemented yet: ${input.actionName}`);
  }
  return handler(
    input.input,
    readInstabotCredential({
      apiKey: requiredString(input.apiKey, "apiKey", (message) => new ProviderRequestError(400, message)),
      masterApiKey: input.values?.masterApiKey ?? "",
    }),
    fetcher,
  );
}

async function listUsers(
  path: string,
  input: Record<string, unknown>,
  credential: InstabotCredential,
  fetcher: typeof fetch,
  since?: string,
) {
  const payload = await requestInstabotJson({
    path,
    method: "GET",
    query: compactObject({
      since,
      type: "all",
      limit: readOptionalIntegerString(input.limit),
      skip: readOptionalIntegerString(input.skip),
      orderBy: readOptionalString(input.orderBy),
      resolve: readResolve(input.resolve),
      getTotalCount: typeof input.getTotalCount === "boolean" ? String(input.getTotalCount) : undefined,
    }),
    credential,
    fetcher,
    phase: "execute",
  });
  return {
    status: normalizeStatus(payload),
    users: Array.isArray(payload.data) ? payload.data.filter(isRecord) : [],
    hasMoreRecords: typeof payload.hasMoreRecords === "boolean" ? payload.hasMoreRecords : null,
    totalCount: Number.isInteger(payload.totalCount) ? payload.totalCount : null,
  };
}

async function requestInstabotJson(input: InstabotRequestInput) {
  const timeoutHandle = createProviderTimeout(undefined, instabotDefaultRequestTimeoutMs);
  try {
    const url = new URL(input.path.replace(/^\//, ""), `${instabotApiBaseUrl}/`);
    for (const [key, value] of Object.entries(input.query ?? {})) {
      if (value !== undefined) {
        url.searchParams.set(key, value);
      }
    }
    const response = await input.fetcher(url, {
      method: input.method,
      headers: {
        accept: "application/json",
        authorization: `X-Instabot-Master-Api-Key ${input.credential.masterApiKey}`,
        ...(input.body ? { "content-type": "application/json" } : {}),
        "user-agent": providerUserAgent,
        "x-instabot-api-key": input.credential.apiKey,
      },
      body: input.body ? JSON.stringify(input.body) : undefined,
      signal: timeoutHandle.signal,
    });
    const payload = await readPayload(response);
    if (!response.ok) {
      throw createInstabotError(response.status, payload, input.phase);
    }
    const record = optionalRecord(payload);
    if (!record) {
      throw new ProviderRequestError(502, "Instabot returned an invalid payload");
    }
    const apiStatusCode = optionalString(record.apiStatusCode);
    if (apiStatusCode && apiStatusCode !== "Success") {
      throw createInstabotError(response.status, record, input.phase);
    }
    return record;
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    if (timeoutHandle.didTimeout() || isAbortLikeError(error)) {
      throw new ProviderRequestError(504, "Instabot request timed out");
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Instabot request failed: ${error.message}` : "Instabot request failed",
    );
  } finally {
    timeoutHandle.cleanup();
  }
}

async function readPayload(response: Response) {
  const text = await response.text();
  if (text.trim() === "") {
    return { apiStatusCode: "Success" };
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "Instabot returned invalid JSON");
  }
}

function createInstabotError(status: number, payload: unknown, phase: InstabotPhase) {
  const record = optionalRecord(payload);
  const message =
    optionalString(record?.apiStatusMessage)?.trim() ||
    optionalString(record?.message)?.trim() ||
    `Instabot request failed with status ${status}`;
  if (status === 429) {
    return new ProviderRequestError(429, message);
  }
  if (phase === "validate" && status >= 400 && status < 500) {
    return new ProviderRequestError(400, message);
  }
  if (phase === "execute" && status === 401) {
    return new ProviderRequestError(401, message);
  }
  if (phase === "execute" && status === 403) {
    return new ProviderRequestError(403, message);
  }
  if (phase === "execute" && status >= 400 && status < 500) {
    return new ProviderRequestError(status, message);
  }
  return new ProviderRequestError(status >= 400 ? status : 502, message);
}

function normalizeStatus(payload: Record<string, unknown>) {
  return {
    apiStatusCode: optionalString(payload.apiStatusCode) ?? "Success",
    apiStatusMessage: optionalString(payload.apiStatusMessage) ?? null,
  };
}

function readInstabotCredential(input: Record<string, string>): InstabotCredential {
  return {
    apiKey: requiredString(input.apiKey, "apiKey", (message) => new ProviderRequestError(400, message)),
    masterApiKey: readRequiredString(input.masterApiKey, "masterApiKey"),
  };
}

function readUserId(value: unknown) {
  return String(requirePositiveInteger(value, "userId must be a positive integer"));
}

function requirePositiveInteger(value: unknown, message: string) {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
    throw new ProviderRequestError(400, message);
  }
  return value;
}

function readRequiredString(value: unknown, fieldName: string) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new ProviderRequestError(400, `${fieldName} is required`);
  }
  return value.trim();
}

function readOptionalString(value: unknown) {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;
}

function readOptionalIntegerString(value: unknown) {
  return typeof value === "number" && Number.isInteger(value) ? String(value) : undefined;
}

function readResolve(value: unknown) {
  if (!Array.isArray(value)) {
    return undefined;
  }
  return value.filter((item): item is string => typeof item === "string").join(",");
}

function requireObject(value: unknown, message: string) {
  const record = optionalRecord(value);
  if (!record) {
    throw new ProviderRequestError(502, message);
  }
  return record;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return optionalRecord(value) !== undefined;
}

function isAbortLikeError(error: unknown) {
  return error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError");
}
