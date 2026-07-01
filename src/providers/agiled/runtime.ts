import type { CredentialValidationResult } from "../../core/types.ts";
import type { AgiledActionName } from "./actions.ts";

import { compactObject, optionalRecord, optionalString } from "../../core/cast.ts";
import { providerUserAgent, ProviderRequestError } from "../provider-runtime.ts";

export const agiledApiBaseUrl = "https://my.agiled.app/api/v1";
export const agiledDefaultRequestTimeoutMs = 30_000;

interface AgiledActionContext {
  apiKey: string;
  brand: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

interface AgiledRequestOptions {
  apiKey: string;
  brand: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
  method?: string;
  body?: Record<string, unknown>;
  phase?: "validate" | "execute";
}

type AgiledActionHandler = (input: Record<string, unknown>, context: AgiledActionContext) => Promise<unknown>;

export const agiledActionHandlers: Record<AgiledActionName, AgiledActionHandler> = {
  list_contacts(_input, context) {
    return listAgiledItems("contacts", "/contacts", context);
  },
  get_contact(input, context) {
    return getAgiledItem("contact", `/contact/${readId(input.id, "id")}`, context);
  },
  create_contact(input, context) {
    return writeAgiledItem("contact", "/contacts", input, context, "POST");
  },
  update_contact(input, context) {
    return writeAgiledItem("contact", `/contacts/${readId(input.id, "id")}`, input, context, "PUT");
  },
  delete_contact(input, context) {
    return deleteAgiledItem(`/contacts/${readId(input.id, "id")}`, context);
  },
  list_projects(_input, context) {
    return listAgiledItems("projects", "/projects", context);
  },
  get_project(input, context) {
    return getAgiledItem("project", `/project/${readId(input.id, "id")}`, context);
  },
  create_project(input, context) {
    return writeAgiledItem("project", "/projects", input, context, "POST");
  },
  update_project(input, context) {
    return writeAgiledItem("project", `/projects/${readId(input.id, "id")}`, input, context, "PUT");
  },
  delete_project(input, context) {
    return deleteAgiledItem(`/projects/${readId(input.id, "id")}`, context);
  },
  list_tasks(_input, context) {
    return listAgiledItems("tasks", "/tasks", context);
  },
  get_task(input, context) {
    return getAgiledItem("task", `/task/${readId(input.id, "id")}`, context);
  },
  create_task(input, context) {
    return writeAgiledItem("task", "/tasks", input, context, "POST");
  },
  update_task(input, context) {
    return writeAgiledItem("task", `/tasks/${readId(input.id, "id")}`, input, context, "PUT");
  },
  delete_task(input, context) {
    return deleteAgiledItem(`/tasks/${readId(input.id, "id")}`, context);
  },
};

export async function validateAgiledCredential(
  input: Record<string, string>,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const apiKey = readAgiledApiKey(input.apiKey);
  const brand = readAgiledBrand(input);
  const payload = await requestAgiledJson("/users", {
    apiKey,
    brand,
    fetcher,
    signal,
    phase: "validate",
  });
  const users = readAgiledDataArray(payload);
  const firstUser = optionalRecord(users[0]);
  const accountLabel = optionalString(firstUser?.name) ?? optionalString(firstUser?.email) ?? new URL(brand).hostname;

  return {
    profile: {
      accountId: readOptionalId(firstUser?.id) ?? new URL(brand).hostname,
      displayName: accountLabel,
    },
    grantedScopes: [],
    metadata: compactObject({
      apiBaseUrl: agiledApiBaseUrl,
      brand,
      validationEndpoint: "/users",
      userId: firstUser?.id,
      userEmail: optionalString(firstUser?.email),
    }),
  };
}

export function readAgiledBrand(extraFields: Record<string, unknown> | undefined): string {
  const brand = optionalString(extraFields?.brand);
  if (!brand) {
    throw new ProviderRequestError(400, "agiled requires brand extra field");
  }

  try {
    const parsed = new URL(brand);
    if (parsed.protocol !== "https:") {
      throw new ProviderRequestError(400, "agiled brand must be an HTTPS URL");
    }
    return parsed.origin;
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    throw new ProviderRequestError(400, "agiled brand must be a valid URL");
  }
}

export function readAgiledApiKey(apiKey: string | undefined): string {
  if (!apiKey) {
    throw new ProviderRequestError(400, "missing agiled API token");
  }
  return apiKey;
}

async function listAgiledItems(
  outputKey: "contacts" | "projects" | "tasks",
  path: string,
  context: AgiledActionContext,
) {
  const raw = await requestAgiledJson(path, buildRequestOptions(context));
  return {
    [outputKey]: readAgiledDataArray(raw),
    raw,
  };
}

async function getAgiledItem(outputKey: "contact" | "project" | "task", path: string, context: AgiledActionContext) {
  const raw = await requestAgiledJson(path, buildRequestOptions(context));
  return {
    [outputKey]: readAgiledDataObject(raw, outputKey),
    raw,
  };
}

async function writeAgiledItem(
  outputKey: "contact" | "project" | "task",
  path: string,
  input: Record<string, unknown>,
  context: AgiledActionContext,
  method: "POST" | "PUT",
) {
  const raw = await requestAgiledJson(path, {
    ...buildRequestOptions(context),
    method,
    body: omitInputId(input),
  });
  return {
    [outputKey]: readAgiledDataObject(raw, outputKey),
    raw,
  };
}

async function deleteAgiledItem(path: string, context: AgiledActionContext) {
  await requestAgiledJson(path, {
    ...buildRequestOptions(context),
    method: "DELETE",
  });
  return { deleted: true };
}

function buildRequestOptions(context: AgiledActionContext): AgiledRequestOptions {
  return {
    apiKey: context.apiKey,
    brand: context.brand,
    fetcher: context.fetcher,
    signal: context.signal,
  };
}

async function requestAgiledJson(path: string, options: AgiledRequestOptions): Promise<unknown> {
  const timeoutSignal = AbortSignal.timeout(agiledDefaultRequestTimeoutMs);
  const signal = options.signal ? AbortSignal.any([options.signal, timeoutSignal]) : timeoutSignal;

  try {
    const response = await options.fetcher(buildAgiledUrl(path, options.apiKey), {
      method: options.method ?? "GET",
      headers: buildAgiledHeaders(options.brand),
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal,
    });
    const payload = await readAgiledPayload(response);

    if (!response.ok) {
      const message = readAgiledErrorMessage(payload) ?? `agiled request failed with ${response.status}`;
      if (response.status === 401 || response.status === 403) {
        throw new ProviderRequestError(options.phase === "validate" ? 400 : response.status, message, payload);
      }
      if (response.status === 400 || response.status === 404 || response.status === 422) {
        throw new ProviderRequestError(400, message, payload);
      }
      throw new ProviderRequestError(response.status >= 500 ? 502 : response.status, message, payload);
    }

    return payload;
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    if (timeoutSignal.aborted && !options.signal?.aborted) {
      throw new ProviderRequestError(504, "agiled request timed out");
    }
    const message = error instanceof Error ? `agiled request failed: ${error.message}` : "agiled request failed";
    throw new ProviderRequestError(502, message);
  }
}

function buildAgiledUrl(path: string, apiKey: string) {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const url = new URL(`${agiledApiBaseUrl}${normalizedPath}`);
  url.searchParams.set("api_token", apiKey);
  return url.toString();
}

function buildAgiledHeaders(brand: string): HeadersInit {
  return {
    accept: "application/json",
    "content-type": "application/json",
    Brand: brand,
    "user-agent": providerUserAgent,
  };
}

async function readAgiledPayload(response: Response): Promise<unknown> {
  if (response.status === 204) {
    return null;
  }
  const text = await response.text();
  if (!text) {
    return null;
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new ProviderRequestError(502, "agiled returned invalid JSON");
  }
}

function readAgiledDataArray(payload: unknown): unknown[] {
  const payloadObject = optionalRecord(payload);
  if (Array.isArray(payload)) {
    return payload;
  }
  if (payloadObject && Array.isArray(payloadObject.data)) {
    return payloadObject.data;
  }
  throw new ProviderRequestError(502, "agiled returned invalid data response");
}

function readAgiledDataObject(payload: unknown, label: string): Record<string, unknown> {
  const payloadObject = optionalRecord(payload);
  if (!payloadObject) {
    throw new ProviderRequestError(502, `agiled returned invalid ${label} response`);
  }

  if ("data" in payloadObject) {
    const dataObject = optionalRecord(payloadObject.data);
    if (!dataObject) {
      throw new ProviderRequestError(502, `agiled returned invalid ${label} response`);
    }
    return dataObject;
  }

  return payloadObject;
}

function readAgiledErrorMessage(payload: unknown): string | undefined {
  const payloadObject = optionalRecord(payload);
  return (
    optionalString(payloadObject?.message) ??
    optionalString(payloadObject?.error) ??
    optionalString(payloadObject?.errors)
  );
}

function readId(value: unknown, field: string): number {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) {
    return value;
  }
  throw new ProviderRequestError(400, `${field} must be a positive integer`);
}

function readOptionalId(value: unknown): string | undefined {
  if (typeof value === "number" && Number.isInteger(value)) {
    return String(value);
  }
  if (typeof value === "string" && value) {
    return value;
  }
  return undefined;
}

function omitInputId(input: Record<string, unknown>): Record<string, unknown> {
  const { id: _id, ...body } = input;
  return body;
}
