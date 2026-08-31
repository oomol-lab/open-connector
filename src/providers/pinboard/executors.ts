import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { compactObject, optionalRawString, optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import {
  createProviderTimeout,
  defineApiKeyProviderExecutors,
  defineProviderProxy,
  isAbortLikeError,
  providerUserAgent,
  ProviderRequestError,
  requiredInputString,
} from "../provider-runtime.ts";

const service = "pinboard";
const pinboardApiBaseUrl = "https://api.pinboard.in/v1";
const requestTimeoutMs = 30_000;

interface PinboardBookmark {
  url: string;
  title: string;
  description?: string;
  tags: string[];
  createdAt?: string;
  hash?: string;
  meta?: string;
  shared?: boolean;
  toRead?: boolean;
  others?: number;
}

interface PinboardRequestInput {
  path: string;
  query?: Record<string, string | undefined>;
}

type PinboardRequestPhase = "validate" | "execute";
type PinboardActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

const pinboardActionHandlers: ProviderActionHandlers<"pinboard", PinboardActionHandler> = {
  async get_last_update(_input, context) {
    const payload = await requestPinboardJson({ path: "/posts/update" }, context, "execute");
    return { updateTime: readUpdateTime(payload) };
  },
  async list_recent_bookmarks(input, context) {
    const payload = await requestPinboardJson(
      {
        path: "/posts/recent",
        query: {
          tag: readOptionalTag(input.tag, "tag"),
          count: readOptionalInteger(input.count),
        },
      },
      context,
      "execute",
    );
    return readBookmarkListOutput(payload);
  },
  async get_bookmarks(input, context) {
    const payload = await requestPinboardJson(
      {
        path: "/posts/get",
        query: {
          url: optionalString(input.url),
          tag: readTagQuery(input.tags, "tags", 3),
          dt: optionalString(input.date),
          meta: readOptionalBooleanAsYesNo(input.includeMeta),
        },
      },
      context,
      "execute",
    );
    return readBookmarkListOutput(payload);
  },
  async add_bookmark(input, context) {
    const payload = await requestPinboardJson(
      {
        path: "/posts/add",
        query: {
          url: requiredInputString(input.url, "url"),
          description: requiredInputString(input.title, "title"),
          extended: optionalString(input.description),
          tags: readTagQuery(input.tags, "tags", 100),
          dt: optionalString(input.createdAt),
          replace: readOptionalBooleanAsYesNo(input.replace),
          shared: readOptionalBooleanAsYesNo(input.shared),
          toread: readOptionalBooleanAsYesNo(input.toRead),
        },
      },
      context,
      "execute",
    );
    return readResultOutput(payload);
  },
  async delete_bookmark(input, context) {
    const payload = await requestPinboardJson(
      {
        path: "/posts/delete",
        query: { url: requiredInputString(input.url, "url") },
      },
      context,
      "execute",
    );
    return readResultOutput(payload);
  },
  async list_tags(_input, context) {
    const payload = await requestPinboardJson({ path: "/tags/get" }, context, "execute");
    return { tags: readTagCounts(payload) };
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, pinboardActionHandlers, {
  skipDnsValidation: true,
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: pinboardApiBaseUrl,
  auth: { type: "api_key_query", name: "auth_token" },
  skipDnsValidation: true,
  customizeRequest({ headers }) {
    headers.set("accept", "application/json");
  },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const apiToken = readPinboardApiToken(input.apiKey);
    const payload = await requestPinboardJson(
      { path: "/posts/update" },
      { apiKey: apiToken, fetcher, signal },
      "validate",
    );
    const updateTime = readUpdateTime(payload);
    const username = readUsernameFromApiToken(apiToken);

    return {
      profile: {
        accountId: username,
        displayName: `Pinboard ${username}`,
      },
      grantedScopes: [],
      metadata: {
        apiBaseUrl: pinboardApiBaseUrl,
        username,
        validationEndpoint: "/posts/update",
        lastUpdateTime: updateTime,
      },
    };
  },
};

async function requestPinboardJson(
  input: PinboardRequestInput,
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">,
  phase: PinboardRequestPhase,
): Promise<unknown> {
  const apiToken = readPinboardApiToken(context.apiKey);
  const url = new URL(`${pinboardApiBaseUrl}${input.path}`);
  url.searchParams.set("format", "json");
  url.searchParams.set("auth_token", apiToken);
  for (const [key, value] of Object.entries(input.query ?? {})) {
    if (value !== undefined && value !== "") {
      url.searchParams.set(key, value);
    }
  }

  const timeout = createProviderTimeout(context.signal, requestTimeoutMs);
  try {
    const response = await context.fetcher(url, {
      method: "GET",
      headers: {
        accept: "application/json",
        "user-agent": providerUserAgent,
      },
      signal: timeout.signal,
    });
    const payload = await readPinboardPayload(response);
    if (!response.ok) {
      throw createPinboardError(response.status, response.statusText, payload, phase);
    }
    return payload;
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    if (timeout.didTimeout() || isAbortLikeError(error)) {
      throw new ProviderRequestError(504, `Pinboard request timed out after ${requestTimeoutMs / 1000} seconds`);
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Pinboard request failed: ${error.message}` : "Pinboard request failed",
      error,
    );
  } finally {
    timeout.cleanup();
  }
}

async function readPinboardPayload(response: Response): Promise<unknown> {
  const text = await response.text().catch(() => "");
  if (text.trim() === "") {
    return null;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function createPinboardError(
  status: number,
  statusText: string,
  payload: unknown,
  phase: PinboardRequestPhase,
): ProviderRequestError {
  const message = extractPinboardErrorMessage(payload) ?? statusText ?? "Pinboard request failed";
  if (status === 401 || status === 403) {
    return new ProviderRequestError(phase === "validate" ? 400 : status, message);
  }
  if (status === 400 || status === 404) {
    return new ProviderRequestError(400, message);
  }
  return new ProviderRequestError(status || 502, message);
}

function extractPinboardErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string") {
    return payload.trim() === "" ? undefined : payload;
  }
  const object = optionalRecord(payload);
  return object
    ? (optionalRawString(object.error) ??
        optionalRawString(object.message) ??
        optionalRawString(object.result_code) ??
        optionalRawString(object.code) ??
        optionalRawString(object.result))
    : undefined;
}

function readUpdateTime(payload: unknown): string {
  const object = readProviderObject(payload, "Pinboard update response");
  const updateTime = optionalRawString(object.update_time) ?? optionalRawString(object.time);
  if (!updateTime) {
    throw new ProviderRequestError(502, "Pinboard update response is missing update time");
  }
  return updateTime;
}

function readBookmarkListOutput(payload: unknown): Record<string, unknown> {
  if (Array.isArray(payload)) {
    return { bookmarks: payload.map((bookmark, index) => readBookmark(bookmark, index)) };
  }

  const object = readProviderObject(payload, "Pinboard bookmark response");
  const rawPosts = object.posts ?? object.post;
  const rawBookmarks = Array.isArray(rawPosts) ? rawPosts : rawPosts == null ? [] : [rawPosts];
  return compactObject({
    bookmarks: rawBookmarks.map((bookmark, index) => readBookmark(bookmark, index)),
    date: optionalRawString(object.date) ?? optionalRawString(object.dt),
    user: optionalRawString(object.user),
  });
}

function readBookmark(value: unknown, index: number): PinboardBookmark {
  const object = readProviderObject(value, `Pinboard bookmark at index ${index}`);
  const url = optionalRawString(object.href) ?? optionalRawString(object.url);
  if (!url) {
    throw new ProviderRequestError(502, `Pinboard bookmark at index ${index} is missing url`);
  }

  return compactObject({
    url,
    title: optionalString(object.description) ?? optionalString(object.title) ?? url,
    description: optionalString(object.extended),
    tags: readTagsFromValue(object.tags ?? object.tag),
    createdAt: optionalRawString(object.time),
    hash: optionalRawString(object.hash),
    meta: optionalRawString(object.meta),
    shared: readOptionalYesNo(object.shared),
    toRead: readOptionalYesNo(object.toread ?? object.toRead),
    others: readOptionalNumber(object.others),
  }) as PinboardBookmark;
}

function readResultOutput(payload: unknown): { resultCode: string } {
  const object = readProviderObject(payload, "Pinboard result response");
  const resultCode =
    optionalRawString(object.result_code) ?? optionalRawString(object.code) ?? optionalRawString(object.result);
  if (!resultCode) {
    throw new ProviderRequestError(502, "Pinboard result response is missing result code");
  }
  if (resultCode !== "done") {
    throw new ProviderRequestError(400, resultCode);
  }
  return { resultCode };
}

function readTagCounts(payload: unknown): Array<{ tag: string; count: number }> {
  const root = readProviderObject(payload, "Pinboard tags response");
  const value = root.tags ?? payload;
  if (Array.isArray(value)) {
    return value.map((item, index) => {
      const object = readProviderObject(item, `Pinboard tag at index ${index}`);
      const tag = optionalRawString(object.tag) ?? optionalRawString(object.name);
      if (!tag) {
        throw new ProviderRequestError(502, `Pinboard tag at index ${index} is missing tag`);
      }
      return { tag, count: readNumber(object.count, `Pinboard tag ${tag} count`) };
    });
  }

  return Object.entries(readProviderObject(value, "Pinboard tags response")).map(([tag, count]) => ({
    tag,
    count: readNumber(count, `Pinboard tag ${tag} count`),
  }));
}

function readProviderObject(value: unknown, label: string): Record<string, unknown> {
  const object = optionalRecord(value);
  if (!object) {
    throw new ProviderRequestError(502, `${label} must be a JSON object`);
  }
  return object;
}

function readOptionalInteger(value: unknown): string | undefined {
  if (value == null) {
    return undefined;
  }
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new ProviderRequestError(400, "integer input is required");
  }
  return String(value);
}

function readOptionalBooleanAsYesNo(value: unknown): string | undefined {
  if (value == null) {
    return undefined;
  }
  if (typeof value !== "boolean") {
    throw new ProviderRequestError(400, "boolean input is required");
  }
  return value ? "yes" : "no";
}

function readOptionalYesNo(value: unknown): boolean | undefined {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "string") {
    if (value === "yes" || value === "1" || value === "true") return true;
    if (value === "no" || value === "0" || value === "false") return false;
  }
  return undefined;
}

function readTagQuery(value: unknown, fieldName: string, maxCount: number): string | undefined {
  const tags = readOptionalTagArray(value, fieldName, maxCount);
  return tags?.join(" ");
}

function readOptionalTag(value: unknown, fieldName: string): string | undefined {
  return value == null ? undefined : readTag(value, fieldName);
}

function readOptionalTagArray(value: unknown, fieldName: string, maxCount: number): string[] | undefined {
  if (value == null) {
    return undefined;
  }
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(400, `${fieldName} must be an array`);
  }
  if (value.length > maxCount) {
    throw new ProviderRequestError(400, `${fieldName} can include at most ${maxCount} tags`);
  }
  return value.map((item, index) => readTag(item, `${fieldName}[${index}]`));
}

function readTag(value: unknown, fieldName: string): string {
  const tag = requiredInputString(value, fieldName);
  if (tag.includes(",")) {
    throw new ProviderRequestError(400, `${fieldName} may not contain commas`);
  }
  for (const character of tag) {
    if (character.trim() === "") {
      throw new ProviderRequestError(400, `${fieldName} may not contain whitespace`);
    }
  }
  return tag;
}

function readTagsFromValue(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item, index) => readTag(item, `tags[${index}]`));
  }
  return typeof value === "string"
    ? value
        .split(" ")
        .map((tag) => tag.trim())
        .filter(Boolean)
    : [];
}

function readNumber(value: unknown, label: string): number {
  const number = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
  if (!Number.isFinite(number)) {
    throw new ProviderRequestError(502, `${label} must be a number`);
  }
  return number;
}

function readOptionalNumber(value: unknown): number | undefined {
  return value == null || value === "" ? undefined : readNumber(value, "Pinboard numeric field");
}

function readPinboardApiToken(value: string): string {
  const apiToken = value.trim();
  const colonIndex = apiToken.indexOf(":");
  if (colonIndex <= 0 || colonIndex === apiToken.length - 1) {
    throw new ProviderRequestError(400, "Pinboard API token must use the username:TOKEN format");
  }
  return apiToken;
}

function readUsernameFromApiToken(apiToken: string): string {
  return apiToken.slice(0, apiToken.indexOf(":"));
}
