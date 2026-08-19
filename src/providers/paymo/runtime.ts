import type { CredentialValidationResult, ProviderExecutors } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { Buffer } from "node:buffer";
import {
  compactObject,
  optionalIntegerLike,
  optionalRecord,
  optionalString,
  requiredRecord,
  requiredString,
} from "../../core/cast.ts";
import { defineApiKeyProviderExecutors, ProviderRequestError, providerUserAgent } from "../provider-runtime.ts";

export const paymoApiBaseUrl = "https://app.paymoapp.com/api";

interface PaymoRequestInput {
  apiKey: string;
  phase?: "validate" | "execute";
  method?: string;
  path: string;
  query?: Record<string, string | undefined>;
  body?: Record<string, unknown>;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

type PaymoActionContext = ApiKeyProviderContext;
type PaymoActionHandler = (input: Record<string, unknown>, context: PaymoActionContext) => Promise<unknown>;

export const paymoActionHandlers: ProviderActionHandlers<"paymo", PaymoActionHandler> = {
  get_current_user(_input, context) {
    return requestSinglePaymoResource({
      apiKey: context.apiKey,
      path: "/me",
      collectionKey: "users",
      singularKey: "user",
      fetcher: context.fetcher,
      signal: context.signal,
    });
  },
  list_clients(input, context) {
    return requestPaymoJson({
      apiKey: context.apiKey,
      path: "/clients",
      query: readListQuery(input),
      fetcher: context.fetcher,
      signal: context.signal,
    });
  },
  get_client(input, context) {
    return requestSinglePaymoResource({
      apiKey: context.apiKey,
      path: `/clients/${readId(input.id, "id")}`,
      query: readGetQuery(input),
      collectionKey: "clients",
      singularKey: "client",
      fetcher: context.fetcher,
      signal: context.signal,
    });
  },
  create_client(input, context) {
    return requestSinglePaymoResource({
      apiKey: context.apiKey,
      method: "POST",
      path: "/clients",
      body: readData(input),
      collectionKey: "clients",
      singularKey: "client",
      fetcher: context.fetcher,
      signal: context.signal,
    });
  },
  update_client(input, context) {
    return requestSinglePaymoResource({
      apiKey: context.apiKey,
      method: "PUT",
      path: `/clients/${readId(input.id, "id")}`,
      body: readData(input),
      collectionKey: "clients",
      singularKey: "client",
      fetcher: context.fetcher,
      signal: context.signal,
    });
  },
  delete_client(input, context) {
    return deletePaymoResource(context, `/clients/${readId(input.id, "id")}`);
  },
  list_projects(input, context) {
    return requestPaymoJson({
      apiKey: context.apiKey,
      path: "/projects",
      query: readListQuery(input),
      fetcher: context.fetcher,
      signal: context.signal,
    });
  },
  get_project(input, context) {
    return requestSinglePaymoResource({
      apiKey: context.apiKey,
      path: `/projects/${readId(input.id, "id")}`,
      query: readGetQuery(input),
      collectionKey: "projects",
      singularKey: "project",
      fetcher: context.fetcher,
      signal: context.signal,
    });
  },
  create_project(input, context) {
    return requestSinglePaymoResource({
      apiKey: context.apiKey,
      method: "POST",
      path: "/projects",
      body: readData(input),
      collectionKey: "projects",
      singularKey: "project",
      fetcher: context.fetcher,
      signal: context.signal,
    });
  },
  update_project(input, context) {
    return requestSinglePaymoResource({
      apiKey: context.apiKey,
      method: "PUT",
      path: `/projects/${readId(input.id, "id")}`,
      body: readData(input),
      collectionKey: "projects",
      singularKey: "project",
      fetcher: context.fetcher,
      signal: context.signal,
    });
  },
  delete_project(input, context) {
    return deletePaymoResource(context, `/projects/${readId(input.id, "id")}`);
  },
  list_tasks(input, context) {
    return requestPaymoJson({
      apiKey: context.apiKey,
      path: "/tasks",
      query: readListQuery(input),
      fetcher: context.fetcher,
      signal: context.signal,
    });
  },
  get_task(input, context) {
    return requestSinglePaymoResource({
      apiKey: context.apiKey,
      path: `/tasks/${readId(input.id, "id")}`,
      query: readGetQuery(input),
      collectionKey: "tasks",
      singularKey: "task",
      fetcher: context.fetcher,
      signal: context.signal,
    });
  },
  create_task(input, context) {
    return requestSinglePaymoResource({
      apiKey: context.apiKey,
      method: "POST",
      path: "/tasks",
      body: readData(input),
      collectionKey: "tasks",
      singularKey: "task",
      fetcher: context.fetcher,
      signal: context.signal,
    });
  },
  update_task(input, context) {
    return requestSinglePaymoResource({
      apiKey: context.apiKey,
      method: "PUT",
      path: `/tasks/${readId(input.id, "id")}`,
      body: readData(input),
      collectionKey: "tasks",
      singularKey: "task",
      fetcher: context.fetcher,
      signal: context.signal,
    });
  },
  delete_task(input, context) {
    return deletePaymoResource(context, `/tasks/${readId(input.id, "id")}`);
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors("paymo", paymoActionHandlers);

export async function validatePaymoCredential(
  input: Record<string, string>,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const apiKey = requiredString(input.apiKey, "apiKey", (message) => new ProviderRequestError(401, message));
  const payload = await requestSinglePaymoResource({
    apiKey,
    phase: "validate",
    path: "/me",
    collectionKey: "users",
    singularKey: "user",
    fetcher,
    signal,
  });
  const user = requiredRecord(payload.user, "user", providerOutputError);

  return {
    profile: {
      accountId:
        readNonEmptyString(user.id) ?? readNonEmptyString(user.email) ?? readNonEmptyString(user.name) ?? "paymo",
      displayName: readNonEmptyString(user.name) ?? readNonEmptyString(user.email) ?? "Paymo API Key",
      grantedScopes: [],
    },
    metadata: compactObject({
      userId: readNonEmptyString(user.id),
      email: readNonEmptyString(user.email),
      name: readNonEmptyString(user.name),
    }),
  };
}

async function requestSinglePaymoResource(
  input: PaymoRequestInput & {
    collectionKey: string;
    singularKey: string;
  },
) {
  const payload = await requestPaymoJson(input);
  const record = pickSingleRecord(payload, input.collectionKey);
  return { [input.singularKey]: record };
}

async function deletePaymoResource(context: PaymoActionContext, path: string) {
  await requestPaymoJson({
    apiKey: context.apiKey,
    method: "DELETE",
    path,
    fetcher: context.fetcher,
    signal: context.signal,
  });
  return { deleted: true };
}

async function requestPaymoJson(input: PaymoRequestInput) {
  const url = new URL(`${paymoApiBaseUrl}${input.path}`);
  for (const [key, value] of Object.entries(input.query ?? {})) {
    if (value !== undefined) {
      url.searchParams.set(key, value);
    }
  }

  let response: Response;
  try {
    response = await input.fetcher(url, {
      method: input.method ?? "GET",
      headers: {
        accept: "application/json",
        authorization: `Basic ${Buffer.from(`${input.apiKey}:x`).toString("base64")}`,
        "content-type": "application/json",
        "user-agent": providerUserAgent,
      },
      body: input.body ? JSON.stringify(input.body) : undefined,
      signal: input.signal,
    });
  } catch (error) {
    throw new ProviderRequestError(
      error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError") ? 504 : 502,
      error instanceof Error ? `Paymo API request failed: ${error.message}` : "Paymo API request failed",
    );
  }

  if (response.status === 204 || response.headers.get("content-length") === "0") {
    if (!response.ok) {
      throw mapPaymoError(response.status, {}, input.phase ?? "execute");
    }
    return {};
  }

  const body = await parsePaymoResponse(response);
  if (!response.ok) {
    throw mapPaymoError(response.status, body, input.phase ?? "execute");
  }
  return body;
}

async function parsePaymoResponse(response: Response) {
  const text = await response.text();
  if (!text) {
    return {};
  }
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new ProviderRequestError(502, "Paymo API returned invalid JSON");
  }
}

function mapPaymoError(status: number, body: Record<string, unknown>, phase: "validate" | "execute") {
  const message =
    readNonEmptyString(body.message) ??
    readNonEmptyString(body.error) ??
    readNonEmptyString(body.errors) ??
    `Paymo API request failed with status ${status}`;

  if (phase === "validate" && (status === 401 || status === 403)) {
    return new ProviderRequestError(400, message, body);
  }
  if (phase === "execute" && (status === 401 || status === 403)) {
    return new ProviderRequestError(401, message, body);
  }
  if (status === 429) {
    return new ProviderRequestError(429, message, body);
  }
  if (status >= 400 && status < 500) {
    return new ProviderRequestError(status === 404 ? 400 : status, message, body);
  }
  return new ProviderRequestError(status >= 500 ? 502 : status, message, body);
}

function readListQuery(input: Record<string, unknown>) {
  return {
    where: optionalString(input.where),
    include: optionalString(input.include),
    partial_include: optionalString(input.partial_include),
  };
}

function readGetQuery(input: Record<string, unknown>) {
  return {
    include: optionalString(input.include),
    partial_include: optionalString(input.partial_include),
  };
}

function readData(input: Record<string, unknown>) {
  return requiredRecord(input.data, "paymo data", providerInputError);
}

function readId(value: unknown, fieldName: string) {
  const id = optionalIntegerLike(value, fieldName, providerInputError);
  if (id === undefined) {
    throw new ProviderRequestError(400, `${fieldName} must be an integer`);
  }
  return String(id);
}

function pickSingleRecord(payload: Record<string, unknown>, collectionKey: string) {
  const collection = payload[collectionKey];
  if (Array.isArray(collection)) {
    const record = collection[0];
    if (record && typeof record === "object" && !Array.isArray(record)) {
      return record as Record<string, unknown>;
    }
  }
  const record = optionalRecord(collection);
  if (record) {
    return record;
  }
  throw new ProviderRequestError(502, `Paymo response missing ${collectionKey}`);
}

function readNonEmptyString(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  return optionalString(value);
}

function providerInputError(message: string) {
  return new ProviderRequestError(400, message);
}

function providerOutputError(message: string) {
  return new ProviderRequestError(502, message);
}
