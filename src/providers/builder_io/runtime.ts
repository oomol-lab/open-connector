import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext, ProviderRuntimeHandler } from "../provider-runtime.ts";

import { compactObject, optionalBoolean, optionalInteger, optionalRecord, optionalString } from "../../core/cast.ts";
import { providerUserAgent, ProviderRequestError, runProviderRequest } from "../provider-runtime.ts";

export const builderIoWriteApiBaseUrl = "https://builder.io";

const builderIoApiBaseUrl = "https://cdn.builder.io";

type BuilderIoActionHandler = ProviderRuntimeHandler<ApiKeyProviderContext>;

export const builderIoActionHandlers: ProviderActionHandlers<"builder_io", BuilderIoActionHandler> = {
  async list_content(input, context) {
    const model = requireInputString(input, "model");
    const publicKey = pickPublicKey(context.apiKey, input);
    const url = buildBuilderIoContentUrl(model, publicKey, {
      limit: optionalInteger(input.limit),
      offset: optionalInteger(input.offset),
      query: optionalRecord(input.query),
      userAttributes: optionalRecord(input.userAttributes),
      options: optionalRecord(input.options),
      includeRefs: optionalBoolean(input.includeRefs),
      noTargeting: optionalBoolean(input.noTargeting),
      sort: optionalRecord(input.sort),
    });
    const payload = await requestBuilderIoJson({
      apiKey: context.apiKey,
      url,
      method: "GET",
      context,
    });
    const results = extractContentArray(payload);
    return {
      results: results.map(normalizeContent),
      count: results.length,
      raw: optionalRecord(payload) ?? {},
    };
  },
  async get_content(input, context) {
    const model = requireInputString(input, "model");
    const id = requireInputString(input, "id");
    const publicKey = pickPublicKey(context.apiKey, input);
    const url = buildBuilderIoContentUrl(model, publicKey, {
      query: { id },
      userAttributes: optionalRecord(input.userAttributes),
      options: optionalRecord(input.options),
      includeRefs: optionalBoolean(input.includeRefs),
      noTargeting: optionalBoolean(input.noTargeting),
      limit: 1,
    });
    const payload = await requestBuilderIoJson({
      apiKey: context.apiKey,
      url,
      method: "GET",
      context,
    });
    return {
      content: normalizeContent(extractSingleContent(payload)),
    };
  },
  async create_content(input, context) {
    const model = requireInputString(input, "model");
    const payload = await requestBuilderIoJson({
      apiKey: context.apiKey,
      url: buildBuilderIoWriteUrl(model),
      method: "POST",
      body: buildContentWriteBody(input),
      context,
    });
    return {
      content: normalizeContent(extractSingleContent(payload)),
    };
  },
  async update_content(input, context) {
    const model = requireInputString(input, "model");
    const id = requireInputString(input, "id");
    const payload = await requestBuilderIoJson({
      apiKey: context.apiKey,
      url: buildBuilderIoWriteUrl(model, id),
      method: "PATCH",
      body: buildContentWriteBody(input),
      context,
    });
    return {
      content: normalizeContent(extractSingleContent(payload)),
    };
  },
  async delete_content(input, context) {
    const model = requireInputString(input, "model");
    const id = requireInputString(input, "id");
    const payload = await requestBuilderIoJson({
      apiKey: context.apiKey,
      url: buildBuilderIoWriteUrl(model, id),
      method: "DELETE",
      context,
    });
    return {
      id,
      deleted: true,
      raw: optionalRecord(payload) ?? {},
    };
  },
};

function buildBuilderIoContentUrl(
  model: string,
  publicKey: string,
  input: {
    limit?: number;
    offset?: number;
    query?: Record<string, unknown>;
    userAttributes?: Record<string, unknown>;
    options?: Record<string, unknown>;
    includeRefs?: boolean;
    noTargeting?: boolean;
    sort?: Record<string, unknown>;
  },
): URL {
  const url = new URL(`/api/v3/content/${encodeURIComponent(model)}`, builderIoApiBaseUrl);
  url.searchParams.set("apiKey", publicKey);
  appendNumberParam(url, "limit", input.limit);
  appendNumberParam(url, "offset", input.offset);
  appendBooleanParam(url, "includeRefs", input.includeRefs);
  appendBooleanParam(url, "noTargeting", input.noTargeting);
  appendJsonParam(url, "query", input.query);
  appendJsonParam(url, "userAttributes", input.userAttributes);
  appendJsonParam(url, "options", input.options);
  appendJsonParam(url, "sort", input.sort);
  return url;
}

function buildBuilderIoWriteUrl(model: string, id?: string): URL {
  const path = id
    ? `/api/v1/write/${encodeURIComponent(model)}/${encodeURIComponent(id)}`
    : `/api/v1/write/${encodeURIComponent(model)}`;
  return new URL(path, builderIoWriteApiBaseUrl);
}

async function requestBuilderIoJson(input: {
  apiKey: string;
  url: URL;
  method: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  context: Pick<ApiKeyProviderContext, "fetcher" | "signal">;
}): Promise<unknown> {
  const headers: Record<string, string> = {
    accept: "application/json",
    authorization: `Bearer ${input.apiKey}`,
    "user-agent": providerUserAgent,
  };
  if (input.body !== undefined) {
    headers["content-type"] = "application/json";
  }

  return runProviderRequest({ signal: input.context.signal, label: "Builder.io" }, async (signal) => {
    const response = await input.context.fetcher(input.url, {
      method: input.method,
      headers,
      body: input.body === undefined ? undefined : JSON.stringify(input.body),
      signal,
    });
    const payload = await readBuilderIoPayload(response);
    if (!response.ok) {
      throw createBuilderIoError(response.status, payload);
    }
    return payload;
  });
}

function buildContentWriteBody(input: Record<string, unknown>): Record<string, unknown> {
  return compactObject({
    name: optionalString(input.name),
    data: optionalRecord(input.data),
    published: optionalString(input.published),
    query: optionalRecord(input.query),
  }) as Record<string, unknown>;
}

function pickPublicKey(apiKey: string, input: Record<string, unknown>): string {
  return optionalString(input.publicKey) ?? apiKey;
}

function requireInputString(input: Record<string, unknown>, key: string): string {
  const value = optionalString(input[key]);
  if (!value) {
    throw new ProviderRequestError(400, `${key} is required`);
  }
  return value;
}

function appendNumberParam(url: URL, name: string, value: number | undefined): void {
  if (value !== undefined) {
    url.searchParams.set(name, String(value));
  }
}

function appendBooleanParam(url: URL, name: string, value: boolean | undefined): void {
  if (value !== undefined) {
    url.searchParams.set(name, String(value));
  }
}

function appendJsonParam(url: URL, name: string, value: Record<string, unknown> | undefined): void {
  if (value !== undefined) {
    url.searchParams.set(name, JSON.stringify(value));
  }
}

function extractContentArray(payload: unknown): Array<Record<string, unknown>> {
  const object = optionalRecord(payload);
  if (!object) {
    throw new ProviderRequestError(502, "Builder.io returned a non-object response", payload);
  }

  if (Array.isArray(object.results)) {
    return object.results.map((item) => requireContentObject(item));
  }
  if (Array.isArray(object.data)) {
    return object.data.map((item) => requireContentObject(item));
  }

  return [requireContentObject(object)];
}

function extractSingleContent(payload: unknown): Record<string, unknown> {
  const object = optionalRecord(payload);
  if (!object) {
    throw new ProviderRequestError(502, "Builder.io returned a non-object response", payload);
  }

  const result = optionalRecord(object.result);
  if (result) {
    return result;
  }

  const results = Array.isArray(object.results) ? object.results : undefined;
  if (results?.length) {
    return requireContentObject(results[0]);
  }

  if (
    optionalString(object.id) ||
    optionalString(object._id) ||
    optionalString(object.name) ||
    optionalString(object.modelId) ||
    optionalString(object.published)
  ) {
    return object;
  }

  const data = optionalRecord(object.data);
  if (data) {
    return data;
  }

  return object;
}

function requireContentObject(value: unknown): Record<string, unknown> {
  const object = optionalRecord(value);
  if (!object) {
    throw new ProviderRequestError(502, "Builder.io returned an invalid content entry", value);
  }
  return object;
}

function normalizeContent(content: Record<string, unknown>): Record<string, unknown> {
  return compactObject({
    id: optionalString(content.id) ?? optionalString(content._id) ?? "",
    name: optionalString(content.name),
    modelId: optionalString(content.modelId),
    published: optionalString(content.published),
    data: optionalRecord(content.data) ?? {},
    raw: content,
  }) as Record<string, unknown>;
}

async function readBuilderIoPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return {
      message: text,
    };
  }
}

function createBuilderIoError(status: number, payload: unknown): ProviderRequestError {
  const message = pickMessage(optionalRecord(payload)) ?? "Builder.io API request failed.";
  if (status === 401 || status === 403) {
    return new ProviderRequestError(403, message, payload);
  }
  if ([400, 404, 422].includes(status)) {
    return new ProviderRequestError(400, message, payload);
  }
  if (status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  return new ProviderRequestError(status >= 500 ? status : 502, message, payload);
}

function pickMessage(body: Record<string, unknown> | undefined): string | undefined {
  if (!body) {
    return undefined;
  }

  for (const key of ["message", "error", "errorMessage"]) {
    const value = optionalString(body[key]);
    if (value) {
      return value;
    }
  }

  const errors = Array.isArray(body.errors) ? body.errors : undefined;
  const firstError = errors ? optionalRecord(errors[0]) : undefined;
  return optionalString(firstError?.message);
}
