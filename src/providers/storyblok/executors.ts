import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { ProviderFetch } from "../provider-runtime.ts";
import type { StoryblokActionName } from "./actions.ts";

import { compactObject, optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import {
  defineProviderExecutors,
  defineProviderProxy,
  providerUserAgent,
  ProviderRequestError,
  requireApiKeyCredential,
} from "../provider-runtime.ts";

const service = "storyblok";

type StoryblokPhase = "validate" | "execute";
type StoryblokRegion = "eu" | "us" | "ca" | "ap" | "cn";
type StoryblokQueryValue = string | number | boolean | undefined;
type StoryblokQueryInput = Record<string, StoryblokQueryValue>;
type StoryblokFilterQueryInput = Record<string, Record<string, string | number | boolean>>;

interface StoryblokActionContext {
  apiKey: string;
  baseUrl: string;
  fetcher: ProviderFetch;
  signal?: AbortSignal;
}

type StoryblokActionHandler = (input: Record<string, unknown>, context: StoryblokActionContext) => Promise<unknown>;

const storyblokApiBaseUrlByRegion = {
  eu: "https://api.storyblok.com/v2/cdn",
  us: "https://api-us.storyblok.com/v2/cdn",
  ca: "https://api-ca.storyblok.com/v2/cdn",
  ap: "https://api-ap.storyblok.com/v2/cdn",
  cn: "https://app.storyblokchina.cn/v2/cdn",
} satisfies Record<StoryblokRegion, string>;

const storyblokRegionLabels = {
  eu: "European Union",
  us: "United States",
  ca: "Canada",
  ap: "Australia",
  cn: "China",
} satisfies Record<StoryblokRegion, string>;

const storyblokActionHandlers: Record<StoryblokActionName, StoryblokActionHandler> = {
  get_space(_input, context) {
    return storyblokRequestJson({ path: "/spaces/me" }, context, "execute");
  },
  list_stories(input, context) {
    return storyblokRequestJson(
      {
        path: "/stories",
        query: buildStoryblokQuery(input),
      },
      context,
      "execute",
      { includePagination: true },
    );
  },
  get_story(input, context) {
    const story = requiredString(input.story, "story", providerInputError);
    return storyblokRequestJson(
      {
        path: `/stories/${encodeStoryPath(story)}`,
        query: buildStoryblokQuery(input, ["story"]),
      },
      context,
      "execute",
    );
  },
  list_links(input, context) {
    return storyblokRequestJson(
      {
        path: "/links",
        query: buildStoryblokQuery(input),
      },
      context,
      "execute",
      { includePagination: true },
    );
  },
  list_datasources(input, context) {
    return storyblokRequestJson(
      {
        path: "/datasources",
        query: buildStoryblokQuery(input),
      },
      context,
      "execute",
      { includePagination: true },
    );
  },
  list_datasource_entries(input, context) {
    return storyblokRequestJson(
      {
        path: "/datasource_entries/",
        query: buildStoryblokQuery(input),
      },
      context,
      "execute",
      { includePagination: true },
    );
  },
  list_tags(input, context) {
    return storyblokRequestJson(
      {
        path: "/tags",
        query: buildStoryblokQuery(input),
      },
      context,
      "execute",
    );
  },
};

export const executors: ProviderExecutors = defineProviderExecutors<StoryblokActionContext>({
  service,
  handlers: storyblokActionHandlers,
  async createContext(context, fetcher): Promise<StoryblokActionContext> {
    const credential = await requireApiKeyCredential(context, service);
    const region = normalizeStoryblokRegion(credential.values.region ?? credential.metadata.region);
    return {
      apiKey: credential.apiKey,
      baseUrl: storyblokApiBaseUrlByRegion[region],
      fetcher,
      signal: context.signal,
    };
  },
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: async (context) => {
    const credential = await requireApiKeyCredential(context, service);
    const region = normalizeStoryblokRegion(credential.values.region ?? credential.metadata.region);
    return storyblokApiBaseUrlByRegion[region];
  },
  auth: { type: "api_key_query", name: "token" },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const region = normalizeStoryblokRegion(input.values.region);
    const baseUrl = storyblokApiBaseUrlByRegion[region];
    const payload = await storyblokRequestJson(
      {
        path: "/spaces/me",
      },
      {
        apiKey: input.apiKey,
        baseUrl,
        fetcher,
        signal,
      },
      "validate",
    );
    const space = optionalRecord(optionalRecord(payload)?.space);
    const spaceId = readInteger(space?.id);
    const spaceName = optionalString(space?.name);
    const domain = optionalString(space?.domain);
    const cacheVersion = readInteger(space?.version) ?? optionalString(space?.version);
    const languageCodes = readStringArray(space?.language_codes);

    return {
      profile: {
        accountId: spaceId === undefined ? `storyblok:${region}` : String(spaceId),
        displayName: spaceName ?? `Storyblok ${storyblokRegionLabels[region]} Space`,
      },
      grantedScopes: [],
      metadata: compactObject({
        apiBaseUrl: baseUrl,
        region,
        validationEndpoint: "/spaces/me",
        spaceId,
        spaceName,
        domain,
        cacheVersion,
        languageCodes,
      }),
    };
  },
};

interface StoryblokRequestInput {
  path: string;
  query?: StoryblokQueryInput;
}

async function storyblokRequestJson(
  input: StoryblokRequestInput,
  context: StoryblokActionContext,
  phase: StoryblokPhase,
  options: { includePagination?: boolean } = {},
): Promise<unknown> {
  const { response, payload } = await storyblokRawRequest(input, context, phase);
  const record = optionalRecord(payload);
  if (!options.includePagination || !record) {
    return payload;
  }

  const pagination = readPagination(response.headers);
  if (!pagination) {
    return record;
  }

  return {
    ...record,
    pagination,
  };
}

async function storyblokRawRequest(
  input: StoryblokRequestInput,
  context: StoryblokActionContext,
  phase: StoryblokPhase,
): Promise<{ response: Response; payload: unknown }> {
  const url = new URL(`${context.baseUrl}${input.path}`);
  url.searchParams.set("token", context.apiKey);
  appendStoryblokQuery(url, input.query);

  try {
    const response = await context.fetcher(url, {
      method: "GET",
      headers: {
        accept: "application/json",
        "user-agent": providerUserAgent,
      },
      signal: context.signal,
    });
    const payload = await readStoryblokPayload(response);

    if (!response.ok) {
      throw createStoryblokError(response.status, payload, phase);
    }

    return { response, payload };
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Storyblok request failed: ${error.message}` : "Storyblok request failed",
    );
  }
}

function buildStoryblokQuery(input: Record<string, unknown>, ignoredKeys: string[] = []): StoryblokQueryInput {
  const ignored = new Set(ignoredKeys);
  const query: StoryblokQueryInput = {};

  for (const [key, value] of Object.entries(input)) {
    if (ignored.has(key) || key === "filter_query") {
      continue;
    }
    if (isStoryblokQueryValue(value)) {
      query[key] = value;
    }
  }

  const filterQuery = readFilterQuery(input.filter_query);
  if (filterQuery) {
    for (const [field, operations] of Object.entries(filterQuery)) {
      for (const [operator, value] of Object.entries(operations)) {
        query[`filter_query[${field}][${operator}]`] = value;
      }
    }
  }

  return compactObject(query);
}

function appendStoryblokQuery(url: URL, query: StoryblokQueryInput | undefined): void {
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }
}

function readFilterQuery(value: unknown): StoryblokFilterQueryInput | undefined {
  const record = optionalRecord(value);
  if (!record) {
    return undefined;
  }

  const output: StoryblokFilterQueryInput = {};
  for (const [field, rawOperations] of Object.entries(record)) {
    const operations = optionalRecord(rawOperations);
    if (!operations) {
      continue;
    }

    const normalizedOperations: Record<string, string | number | boolean> = {};
    for (const [operator, operationValue] of Object.entries(operations)) {
      if (
        typeof operationValue === "string" ||
        typeof operationValue === "number" ||
        typeof operationValue === "boolean"
      ) {
        normalizedOperations[operator] = operationValue;
      }
    }

    if (Object.keys(normalizedOperations).length > 0) {
      output[field] = normalizedOperations;
    }
  }

  return Object.keys(output).length > 0 ? output : undefined;
}

async function readStoryblokPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "Storyblok returned invalid JSON");
  }
}

function createStoryblokError(status: number, payload: unknown, phase: StoryblokPhase): ProviderRequestError {
  const message = extractStoryblokMessage(payload) ?? `Storyblok request failed with status ${status}`;
  if (status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if (phase === "validate" && (status === 401 || status === 403)) {
    return new ProviderRequestError(400, message, payload);
  }
  if (phase === "execute" && (status === 401 || status === 403)) {
    return new ProviderRequestError(status, message, payload);
  }
  if (status >= 400 && status < 500) {
    return new ProviderRequestError(400, message, payload);
  }
  return new ProviderRequestError(502, message, payload);
}

function extractStoryblokMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim()) {
    return payload.trim();
  }
  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }

  return optionalString(record.message) ?? optionalString(record.error) ?? optionalString(record.error_description);
}

function readPagination(headers: Headers): Record<string, unknown> | undefined {
  const total = readInteger(headers.get("total"));
  const perPage = readInteger(headers.get("per_page"));
  if (total === undefined && perPage === undefined) {
    return undefined;
  }

  return compactObject({
    total,
    per_page: perPage,
  });
}

function encodeStoryPath(value: string): string {
  return value.split("/").map(encodeURIComponent).join("/");
}

function normalizeStoryblokRegion(value: unknown): StoryblokRegion {
  if (typeof value !== "string") {
    throw new ProviderRequestError(400, "storyblok region is required");
  }

  const normalized = value.trim().toLowerCase();
  if (isStoryblokRegion(normalized)) {
    return normalized;
  }

  throw new ProviderRequestError(400, "storyblok region must be one of eu, us, ca, ap, or cn");
}

function isStoryblokRegion(value: string): value is StoryblokRegion {
  return Object.hasOwn(storyblokApiBaseUrlByRegion, value);
}

function isStoryblokQueryValue(value: unknown): value is Exclude<StoryblokQueryValue, undefined> {
  return typeof value === "string" || typeof value === "number" || typeof value === "boolean";
}

function readInteger(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isInteger(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isInteger(parsed)) {
      return parsed;
    }
  }
  return undefined;
}

function readStringArray(value: unknown): string[] | undefined {
  return Array.isArray(value) && value.every((item) => typeof item === "string") ? value : undefined;
}

function providerInputError(message: string): ProviderRequestError {
  return new ProviderRequestError(400, message);
}
