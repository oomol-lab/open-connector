import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";
import type { AyrshareActionName } from "./actions.ts";

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
} from "../provider-runtime.ts";

const service = "ayrshare";
const ayrshareBaseUrl = "https://api.ayrshare.com/api";
const profileKeyField = "profileKey";

interface AyrshareContext extends ApiKeyProviderContext {
  profileKey?: string;
}

type AyrshareRequestPhase = "validate" | "execute";
type AyrshareMethod = "DELETE" | "GET" | "PATCH" | "POST" | "PUT";
type AyrshareActionHandler = (input: Record<string, unknown>, context: AyrshareContext) => Promise<unknown>;

export const ayrshareActionHandlers: Record<AyrshareActionName, AyrshareActionHandler> = {
  get_user_profile(input, context) {
    return getUserProfile(input, context);
  },
  list_post_history(input, context) {
    return listPostHistory(input, context);
  },
  publish_post(input, context) {
    return publishPost(input, context);
  },
  get_post(input, context) {
    return getPost(input, context);
  },
  delete_post(input, context) {
    return deletePost(input, context);
  },
  update_post(input, context) {
    return updatePost(input, context);
  },
  retry_post(input, context) {
    return retryPost(input, context);
  },
  check_post_length(input, context) {
    return checkPostLength(input, context);
  },
  validate_post(input, context) {
    return validatePost(input, context);
  },
  verify_media_url(input, context) {
    return verifyMediaUrl(input, context);
  },
  get_post_analytics(input, context) {
    return getPostAnalytics(input, context);
  },
};

export const executors: ProviderExecutors = defineProviderExecutors<AyrshareContext>({
  service,
  handlers: ayrshareActionHandlers,
  async createContext(context, fetcher): Promise<AyrshareContext> {
    const credential = await requireApiKeyCredential(context, service);
    const profileKey = optionalString(credential.values?.[profileKeyField]);
    return {
      apiKey: credential.apiKey,
      fetcher,
      profileKey,
      signal: context.signal,
      transitFiles: context.transitFiles,
    };
  },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const profileKey = optionalString(input.values[profileKeyField]);
    await requestAyrshareJson(
      {
        method: "GET",
        path: "/user",
        context: {
          apiKey: input.apiKey,
          fetcher,
          profileKey,
          signal,
        },
      },
      "validate",
    );

    return {
      profile: {
        displayName: profileKey ? "Ayrshare User Profile" : "Ayrshare Primary Profile",
      },
      grantedScopes: [],
      metadata: {
        apiBaseUrl: ayrshareBaseUrl,
        validationEndpoint: "/user",
        usesProfileKey: Boolean(profileKey),
      },
    };
  },
};

async function getUserProfile(input: Record<string, unknown>, context: AyrshareContext): Promise<Record<string, unknown>> {
  const payload = await requestAyrshareJson(
    {
      method: "GET",
      path: "/user",
      context,
      query: {
        instagramDetails: optionalBoolean(input.instagramDetails),
      },
    },
    "execute",
  );
  const object = readObject(payload, "user profile response");
  return {
    activeSocialAccounts: readStringArray(object.activeSocialAccounts),
    displayNames: readObjectArray(object.displayNames),
    raw: object,
  };
}

async function listPostHistory(input: Record<string, unknown>, context: AyrshareContext): Promise<Record<string, unknown>> {
  const payload = await requestAyrshareJson(
    {
      method: "GET",
      path: "/history",
      context,
      query: {
        limit: optionalInteger(input.limit),
        platforms: readOptionalStringArray(input.platforms)?.join(","),
        startDate: optionalString(input.startDate),
        endDate: optionalString(input.endDate),
        lastDays: optionalInteger(input.lastDays),
        status: optionalString(input.status),
        type: optionalString(input.type),
        autoRepostId: optionalString(input.autoRepostId),
      },
    },
    "execute",
  );
  const object = readObject(payload, "post history response");
  return {
    posts: readObjectArray(object.history ?? object.posts),
    raw: object,
  };
}

async function publishPost(input: Record<string, unknown>, context: AyrshareContext): Promise<Record<string, unknown>> {
  const payload = await requestAyrshareJson(
    {
      method: "POST",
      path: "/post",
      context,
      body: compactObject({
        post: optionalString(input.post) ?? "",
        platforms: readStringArray(input.platforms),
        mediaUrls: readOptionalStringArray(input.mediaUrls),
        isVideo: optionalBoolean(input.isVideo),
        scheduleDate: optionalString(input.scheduleDate),
        validateScheduled: optionalBoolean(input.validateScheduled),
        idempotencyKey: optionalString(input.idempotencyKey),
        notes: optionalString(input.notes),
      }),
    },
    "execute",
  );
  return normalizeAyrsharePostResult(readObject(payload, "publish post response"));
}

async function getPost(input: Record<string, unknown>, context: AyrshareContext): Promise<Record<string, unknown>> {
  const id = requiredString(input.id, "id", invalidInputError);
  const payload = await requestAyrshareJson(
    {
      method: "GET",
      path: `/post/${encodeURIComponent(id)}`,
      context,
    },
    "execute",
  );

  return {
    post: normalizeAyrsharePostResult(readObject(payload, "get post response")),
  };
}

async function deletePost(input: Record<string, unknown>, context: AyrshareContext): Promise<Record<string, unknown>> {
  const body = compactObject({
    id: optionalString(input.id),
    bulk: readOptionalStringArray(input.bulk),
    deleteAllScheduled: optionalBoolean(input.deleteAllScheduled),
    markManualDeleted: optionalBoolean(input.markManualDeleted),
  });
  validateDeletePostBody(body);

  const payload = await requestAyrshareJson(
    {
      method: "DELETE",
      path: "/post",
      context,
      body,
    },
    "execute",
  );
  const object = readObject(payload, "delete post response");
  return {
    status: optionalString(object.status) ?? "",
    id: optionalString(object.id) ?? null,
    results: readObjectArray(object.postIds ?? object.results),
    errors: readObjectArray(object.errors),
    raw: object,
  };
}

async function updatePost(input: Record<string, unknown>, context: AyrshareContext): Promise<Record<string, unknown>> {
  const body = compactObject({
    id: requiredString(input.id, "id", invalidInputError),
    approved: optionalBoolean(input.approved),
    disableComments: optionalBoolean(input.disableComments),
    notes: optionalString(input.notes),
    scheduleDate: optionalString(input.scheduleDate),
    scheduledPause: optionalBoolean(input.scheduledPause),
    youTubeOptions: buildYouTubeOptions(input),
  });
  validateUpdatePostBody(body);

  const payload = await requestAyrshareJson(
    {
      method: "PATCH",
      path: "/post",
      context,
      body,
    },
    "execute",
  );
  const object = readObject(payload, "update post response");
  return {
    status: optionalString(object.status) ?? "",
    id: optionalString(object.id) ?? null,
    raw: object,
  };
}

async function retryPost(input: Record<string, unknown>, context: AyrshareContext): Promise<Record<string, unknown>> {
  const payload = await requestAyrshareJson(
    {
      method: "PUT",
      path: "/post/retry",
      context,
      body: {
        id: requiredString(input.id, "id", invalidInputError),
      },
    },
    "execute",
  );
  const object = readObject(payload, "retry post response");
  return {
    status: optionalString(object.status) ?? "",
    id: optionalString(object.id) ?? null,
    raw: object,
  };
}

async function checkPostLength(input: Record<string, unknown>, context: AyrshareContext): Promise<Record<string, unknown>> {
  const payload = await requestAyrshareJson(
    {
      method: "POST",
      path: "/post/checkPostWeight",
      context,
      body: {
        post: optionalString(input.post) ?? "",
      },
    },
    "execute",
  );
  const object = readObject(payload, "post length response");
  return {
    maxCharLimits: readNumberRecord(object.maxCharLimits),
    validByPlatform: collectSuffixBooleans(object, "Valid"),
    weightedLengthByPlatform: collectSuffixNumbers(object, "WeightedLength"),
    raw: object,
  };
}

async function validatePost(input: Record<string, unknown>, context: AyrshareContext): Promise<Record<string, unknown>> {
  const payload = await requestAyrshareJson(
    {
      method: "POST",
      path: "/validate/post",
      context,
      body: compactObject({
        post: optionalString(input.post) ?? "",
        platforms: readStringArray(input.platforms),
        mediaUrls: readOptionalStringArray(input.mediaUrls),
        isVideo: optionalBoolean(input.isVideo),
      }),
    },
    "execute",
  );
  const object = readObject(payload, "validate post response");
  return {
    status: optionalString(object.status) ?? "",
    valid: inferSuccessfulStatus(object),
    errors: readObjectArray(object.errors),
    raw: object,
  };
}

async function verifyMediaUrl(input: Record<string, unknown>, context: AyrshareContext): Promise<Record<string, unknown>> {
  const payload = await requestAyrshareJson(
    {
      method: "POST",
      path: "/media/urlExists",
      context,
      body: {
        mediaUrl: requiredString(input.mediaUrl, "mediaUrl", invalidInputError),
      },
    },
    "execute",
  );
  const object = readObject(payload, "media URL verification response");
  const statusCode = optionalInteger(object.statusCode);
  return {
    status: optionalString(object.status) ?? "",
    statusCode: statusCode ?? null,
    statusText: optionalString(object.statusText) ?? null,
    contentType: optionalString(object.contentType) ?? null,
    exists: inferSuccessfulStatus(object) && (statusCode == null || statusCode < 400),
    raw: object,
  };
}

async function getPostAnalytics(input: Record<string, unknown>, context: AyrshareContext): Promise<Record<string, unknown>> {
  const payload = await requestAyrshareJson(
    {
      method: "POST",
      path: "/analytics/post",
      context,
      body: compactObject({
        id: requiredString(input.id, "id", invalidInputError),
        platforms: readOptionalStringArray(input.platforms),
      }),
    },
    "execute",
  );
  const object = readObject(payload, "post analytics response");
  return {
    status: optionalString(object.status) ?? "",
    id: optionalString(object.id) ?? null,
    postIds: readObjectArray(object.postIds),
    errors: readObjectArray(object.errors),
    raw: object,
  };
}

async function requestAyrshareJson(
  input: {
    method: AyrshareMethod;
    path: string;
    context: Pick<AyrshareContext, "apiKey" | "fetcher" | "profileKey" | "signal">;
    query?: Record<string, unknown>;
    body?: Record<string, unknown>;
  },
  phase: AyrshareRequestPhase,
): Promise<unknown> {
  const url = new URL(`${ayrshareBaseUrl}${input.path}`);
  for (const [key, value] of Object.entries(input.query ?? {})) {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  }

  const headers = new Headers({
    accept: "application/json",
    authorization: `Bearer ${input.context.apiKey}`,
    "user-agent": providerUserAgent,
  });
  if (input.body) {
    headers.set("content-type", "application/json");
  }
  if (input.context.profileKey) {
    headers.set("profile-key", input.context.profileKey);
  }

  let response: Response;
  let payload: unknown;
  try {
    response = await input.context.fetcher(url, {
      method: input.method,
      headers,
      body: input.body ? JSON.stringify(input.body) : undefined,
      signal: input.context.signal,
    });
    payload = await readAyrsharePayload(response);
  } catch (error) {
    throw new ProviderRequestError(
      isAbortError(error) ? 504 : 502,
      error instanceof Error ? `Ayrshare request failed: ${error.message}` : "Ayrshare request failed",
    );
  }

  if (!response.ok) {
    throw createAyrshareError(response, payload, phase);
  }

  return payload;
}

async function readAyrsharePayload(response: Response): Promise<unknown> {
  const text = await response.text().catch(() => "");
  if (!text.trim()) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function createAyrshareError(response: Response, payload: unknown, phase: AyrshareRequestPhase): ProviderRequestError {
  const message = extractAyrshareErrorMessage(payload) ?? response.statusText ?? "Ayrshare request failed";
  if (response.status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if (phase === "validate" && (response.status === 401 || response.status === 403)) {
    return new ProviderRequestError(400, message, payload);
  }
  return new ProviderRequestError(response.status || 502, message, payload);
}

function extractAyrshareErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim()) {
    return payload;
  }
  const object = optionalRecord(payload);
  if (!object) {
    return undefined;
  }
  const nestedError = optionalRecord(object.error);
  return (
    optionalString(object.message) ??
    optionalString(object.error) ??
    optionalString(nestedError?.message) ??
    optionalString(object.details)
  );
}

function readObject(value: unknown, label: string): Record<string, unknown> {
  const object = optionalRecord(value);
  if (!object) {
    throw new ProviderRequestError(502, `invalid Ayrshare ${label}`);
  }
  return object;
}

function readObjectArray(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value) ? value.map((item) => optionalRecord(item) ?? {}) : [];
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function readOptionalStringArray(value: unknown): string[] | undefined {
  return Array.isArray(value) ? readStringArray(value) : undefined;
}

function readNumberRecord(value: unknown): Record<string, number> {
  const object = optionalRecord(value);
  if (!object) {
    return {};
  }
  const result: Record<string, number> = {};
  for (const [key, child] of Object.entries(object)) {
    if (typeof child === "number") {
      result[key] = child;
    }
  }
  return result;
}

function normalizeAyrsharePostResult(object: Record<string, unknown>): Record<string, unknown> {
  return {
    status: optionalString(object.status) ?? "",
    id: optionalString(object.id) ?? null,
    postIds: readObjectArray(object.postIds),
    errors: readObjectArray(object.errors),
    raw: object,
  };
}

function inferSuccessfulStatus(object: Record<string, unknown>): boolean {
  return optionalString(object.status)?.toLowerCase() === "success";
}

function buildYouTubeOptions(input: Record<string, unknown>): Record<string, unknown> | undefined {
  const options = optionalRecord(input.youTubeOptions);
  if (!options) {
    return undefined;
  }

  const body = compactObject({
    visibility: optionalString(options.visibility),
    title: optionalString(options.title),
    description: optionalString(options.description),
    categoryId: optionalInteger(options.categoryId),
  });
  return Object.keys(body).length > 0 ? body : undefined;
}

function validateDeletePostBody(body: Record<string, unknown>): void {
  if (body.deleteAllScheduled === true || optionalString(body.id)) {
    return;
  }
  const bulk = readOptionalStringArray(body.bulk);
  if (bulk && bulk.length > 0) {
    return;
  }
  throw new ProviderRequestError(400, "delete_post requires id, bulk, or deleteAllScheduled");
}

function validateUpdatePostBody(body: Record<string, unknown>): void {
  if (Object.keys(body).some((key) => key !== "id")) {
    return;
  }
  throw new ProviderRequestError(400, "update_post requires at least one update field");
}

function collectSuffixBooleans(object: Record<string, unknown>, suffix: string): Record<string, boolean> {
  const result: Record<string, boolean> = {};
  for (const [key, value] of Object.entries(object)) {
    if (key.endsWith(suffix) && typeof value === "boolean") {
      result[uncapitalizeFirst(key.slice(0, -suffix.length))] = value;
    }
  }
  return result;
}

function collectSuffixNumbers(object: Record<string, unknown>, suffix: string): Record<string, number> {
  const result: Record<string, number> = {};
  for (const [key, value] of Object.entries(object)) {
    if (key.endsWith(suffix) && typeof value === "number") {
      result[uncapitalizeFirst(key.slice(0, -suffix.length))] = value;
    }
  }
  return result;
}

function uncapitalizeFirst(value: string): string {
  return value ? `${value[0]?.toLowerCase()}${value.slice(1)}` : value;
}

function invalidInputError(message: string): ProviderRequestError {
  return new ProviderRequestError(400, message);
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}
