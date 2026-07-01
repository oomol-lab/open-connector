import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";
import type { BannerbearActionName } from "./actions.ts";

import { createHash } from "node:crypto";

import {
  compactObject,
  optionalBoolean,
  optionalInteger,
  optionalRecord,
  optionalString,
  requiredString,
} from "../../core/cast.ts";
import {
  defineProviderExecutors,
  ProviderRequestError,
  providerUserAgent,
  requireApiKeyCredential,
  setSearchParams,
} from "../provider-runtime.ts";

const service = "bannerbear";
const bannerbearApiBaseUrl = "https://api.bannerbear.com";
const bannerbearSyncApiBaseUrl = "https://sync.api.bannerbear.com";

type BannerbearActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

export const bannerbearActionHandlers: Record<BannerbearActionName, BannerbearActionHandler> = {
  get_auth(input, context) {
    return getBannerbearAuth(input, context);
  },
  list_templates(input, context) {
    return listBannerbearTemplates(input, context);
  },
  get_template(input, context) {
    return getBannerbearTemplate(input, context);
  },
  create_image_sync(input, context) {
    return createBannerbearImageSync(input, context);
  },
  get_image(input, context) {
    return getBannerbearImage(input, context);
  },
};

export const executors: ProviderExecutors = defineProviderExecutors<ApiKeyProviderContext>({
  service,
  handlers: bannerbearActionHandlers,
  async createContext(context, fetcher): Promise<ApiKeyProviderContext> {
    const credential = await requireApiKeyCredential(context, service);
    return {
      apiKey: credential.apiKey,
      fetcher,
      signal: context.signal,
      transitFiles: context.transitFiles,
    };
  },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const projectId = optionalString(input.values.projectId);
    const payload = optionalRecord(
      await requestBannerbear({
        apiKey: input.apiKey,
        path: "/v2/auth",
        query: {
          project_id: projectId,
        },
        fetcher,
        signal,
      }),
    ) ?? {};
    const project = optionalString(payload.project) ?? "Bannerbear Project";
    const accountId = projectId ?? `key:${hashBannerbearApiKey(input.apiKey)}`;

    return {
      profile: {
        accountId: `bannerbear:${accountId}`,
        displayName: project,
      },
      grantedScopes: [],
      metadata: compactObject({
        apiBaseUrl: bannerbearApiBaseUrl,
        project,
        projectId,
      }),
    };
  },
};

async function getBannerbearAuth(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<Record<string, unknown>> {
  return optionalRecord(
    await requestBannerbear({
      apiKey: context.apiKey,
      path: "/v2/auth",
      query: {
        project_id: optionalString(input.project_id),
      },
      fetcher: context.fetcher,
      signal: context.signal,
    }),
  ) ?? {};
}

async function listBannerbearTemplates(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<Record<string, unknown>> {
  const payload = await requestBannerbear({
    apiKey: context.apiKey,
    path: "/v2/templates",
    query: {
      page: stringifyOptional(input.page),
      limit: stringifyOptional(input.limit),
      tag: optionalString(input.tag),
      name: optionalString(input.name),
      extended: stringifyOptional(input.extended),
      project_id: optionalString(input.project_id),
    },
    fetcher: context.fetcher,
    signal: context.signal,
  });

  return {
    templates: normalizeArray(payload, "templates"),
  };
}

async function getBannerbearTemplate(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<Record<string, unknown>> {
  const uid = requiredString(input.uid, "uid", invalidInputError);
  const payload = await requestBannerbear({
    apiKey: context.apiKey,
    path: `/v2/templates/${encodeURIComponent(uid)}`,
    query: {
      extended: stringifyOptional(input.extended),
      project_id: optionalString(input.project_id),
    },
    fetcher: context.fetcher,
    signal: context.signal,
  });

  return {
    template: optionalRecord(payload) ?? {},
  };
}

async function createBannerbearImageSync(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<Record<string, unknown>> {
  const payload = await requestBannerbear({
    apiKey: context.apiKey,
    baseUrl: bannerbearSyncApiBaseUrl,
    method: "POST",
    path: "/v2/images",
    body: compactObject({
      template: input.template,
      modifications: input.modifications,
      transparent: optionalBoolean(input.transparent),
      render_pdf: optionalBoolean(input.render_pdf),
      metadata: optionalString(input.metadata),
      project_id: optionalString(input.project_id),
    }),
    fetcher: context.fetcher,
    signal: context.signal,
  });

  return {
    image: optionalRecord(payload) ?? {},
  };
}

async function getBannerbearImage(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<Record<string, unknown>> {
  const uid = requiredString(input.uid, "uid", invalidInputError);
  const payload = await requestBannerbear({
    apiKey: context.apiKey,
    path: `/v2/images/${encodeURIComponent(uid)}`,
    query: {
      project_id: optionalString(input.project_id),
    },
    fetcher: context.fetcher,
    signal: context.signal,
  });

  return {
    image: optionalRecord(payload) ?? {},
  };
}

async function requestBannerbear(input: {
  apiKey: string;
  path: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
  baseUrl?: string;
  method?: string;
  query?: Record<string, string | undefined>;
  body?: unknown;
}): Promise<unknown> {
  const url = new URL(input.path, input.baseUrl ?? bannerbearApiBaseUrl);
  setSearchParams(url, input.query ?? {});

  const headers = new Headers({
    accept: "application/json",
    authorization: `Bearer ${input.apiKey}`,
    "user-agent": providerUserAgent,
  });
  let body: BodyInit | undefined;
  if (input.body !== undefined) {
    headers.set("content-type", "application/json");
    body = JSON.stringify(input.body);
  }

  let response: Response;
  try {
    response = await input.fetcher(url, {
      method: input.method ?? "GET",
      headers,
      body,
      signal: input.signal,
    });
  } catch (error) {
    throw new ProviderRequestError(
      isAbortError(error) ? 504 : 502,
      error instanceof Error ? `Bannerbear request failed: ${error.message}` : "Bannerbear request failed",
    );
  }

  const payload = await readBannerbearResponse(response);
  if (!response.ok) {
    throw mapBannerbearError(response, payload);
  }
  return payload;
}

async function readBannerbearResponse(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { message: text };
  }
}

function mapBannerbearError(response: Response, payload: unknown): ProviderRequestError {
  const message = readErrorMessage(payload) || `Bannerbear request failed with HTTP ${response.status}`;
  if (response.status === 400 || response.status === 401 || response.status === 404) {
    return new ProviderRequestError(response.status, message, payload);
  }
  if (response.status === 402 || response.status === 408 || response.status === 429) {
    return new ProviderRequestError(response.status, message, payload);
  }
  return new ProviderRequestError(response.status || 502, message, payload);
}

function readErrorMessage(payload: unknown): string | undefined {
  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }
  const direct = optionalString(record.message) ?? optionalString(record.error);
  if (direct) {
    return direct;
  }
  const errors = record.errors;
  if (Array.isArray(errors)) {
    return errors.map((error) => String(error)).join(", ");
  }
  return undefined;
}

function normalizeArray(payload: unknown, fieldName: string): unknown[] {
  if (Array.isArray(payload)) {
    return payload;
  }
  const record = optionalRecord(payload) ?? {};
  const nested = record[fieldName];
  return Array.isArray(nested) ? nested : [];
}

function stringifyOptional(value: unknown): string | undefined {
  if (typeof value === "boolean") {
    return String(value);
  }
  const integer = optionalInteger(value);
  if (integer !== undefined) {
    return String(integer);
  }
  return optionalString(value);
}

function hashBannerbearApiKey(apiKey: string): string {
  return createHash("sha256").update(apiKey).digest("hex").slice(0, 16);
}

function invalidInputError(message: string): ProviderRequestError {
  return new ProviderRequestError(400, message);
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}
