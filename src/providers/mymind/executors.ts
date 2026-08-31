import type { CredentialValidators, ExecutionContext, ProviderExecutors } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";

import { SignJWT } from "jose";
import {
  base64Bytes,
  optionalBoolean,
  optionalInteger,
  optionalNumber,
  optionalObjectArray,
  optionalRecord,
  optionalString,
  optionalStringArray,
  requiredString,
} from "../../core/cast.ts";
import { assertPublicHttpUrl, encodePathSegment, jsonObject } from "../../core/request.ts";
import {
  createProviderTimeout,
  defineProviderExecutors,
  isAbortSignalError,
  providerInputError,
  ProviderRequestError,
  providerUserAgent,
  readProviderJsonBody,
  readProviderTextBody,
  requireCustomCredential,
} from "../provider-runtime.ts";

const service = "mymind";
const myMindApiBaseUrl = "https://api.mymind.com";
const requestTimeoutMs = 30_000;
/** mymind recommends a five-minute lifetime for the JWT signed for each request. */
const accessTokenTtlSeconds = 300;
const markdownMediaType = "text/markdown";
const defaultSearchLimit = 20;
const defaultObjectLimit = 50;
/** How mymind words the 422 it returns for an object that has no inline body. */
const missingContentPattern = /does not have content/iu;

type RequestPhase = "validate" | "execute";

/**
 * A mymind access key. The secret never leaves the runtime: it signs a
 * short-lived JWT per request, and only that JWT is sent to mymind.
 */
interface MyMindAccessKey {
  keyId: string;
  keySecret: Uint8Array;
}

interface MyMindContext extends MyMindAccessKey {
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

interface MyMindRequest {
  method: string;
  query?: Record<string, string | string[] | undefined>;
  json?: unknown;
  /** A body sent in its own media type, used by the markdown content and note endpoints. */
  text?: { contentType: string; body: string };
  accept?: string;
}

type ActionHandler = (input: Record<string, unknown>, context: MyMindContext) => Promise<unknown>;

export const myMindActionHandlers: ProviderActionHandlers<"mymind", ActionHandler> = {
  async search_objects(input, context) {
    const limit = optionalInteger(input.limit) ?? defaultSearchLimit;
    const payload = await requestJson(
      "/search",
      {
        method: "GET",
        query: {
          q: requiredString(input.query, "query", providerInputError),
          limit: String(limit),
          semantic: flag(input.semantic),
          semanticBoost: numberParam(input.semanticBoost),
          similarTo: optionalString(input.similarTo),
          rerank: flag(input.rerank),
        },
      },
      context,
      "execute",
    );

    const matches = optionalObjectArray(optionalRecord(payload)?.matches, "search match").slice(0, limit);
    const objectIds = matches.map((match) => optionalString(match.id)).filter((id): id is string => id !== undefined);
    // One list call hydrates every match, so relevance order is preserved by
    // mapping the objects back onto the matches rather than by response order.
    const objectsById = new Map<string, Record<string, unknown>>();
    for (const object of await readObjects(objectIds, context)) {
      const id = optionalString(object.id);
      if (id) {
        objectsById.set(id, object);
      }
    }

    return {
      matches: matches.map((match) => {
        const id = optionalString(match.id);
        return jsonObject({
          id,
          score: optionalNumber(match.score),
          semanticScore: optionalNumber(match.semanticScore),
          object: id === undefined ? undefined : objectsById.get(id),
        });
      }),
    };
  },

  async list_objects(input, context) {
    const payload = await requestJson(
      "/objects",
      {
        method: "GET",
        query: {
          q: optionalString(input.query),
          id: optionalStringArray(input.objectIds),
          spaceId: optionalString(input.spaceId),
          similarTo: optionalString(input.similarTo),
          limit: String(optionalInteger(input.limit) ?? defaultObjectLimit),
        },
      },
      context,
      "execute",
    );
    return { objects: optionalObjectArray(payload, "object") };
  },

  get_object(input, context) {
    return requestJson(`/objects/${objectPath(input)}`, { method: "GET" }, context, "execute");
  },

  async get_object_content(input, context) {
    const objectId = requiredString(input.objectId, "objectId", providerInputError);
    try {
      const markdown = await requestText(
        `/objects/${encodePathSegment(objectId)}/content`,
        { method: "GET", accept: markdownMediaType },
        context,
        "execute",
      );
      return { objectId, markdown, hasContent: true };
    } catch (error) {
      // Plenty of objects carry no inline body at all — a bookmark or an image
      // is the whole object. mymind reports that as a 422, but for a caller
      // walking search results it is an ordinary answer, not a failed read.
      // Both the status and the message are checked so an unrelated failure
      // that happens to echo this wording is not swallowed as empty content.
      if (error instanceof ProviderRequestError && error.status === 422 && missingContentPattern.test(error.message)) {
        return { objectId, markdown: "", hasContent: false };
      }
      throw error;
    }
  },

  save_url(input, context) {
    const url = assertPublicHttpUrl(requiredString(input.url, "url", providerInputError), {
      fieldName: "url",
      createError: providerInputError,
    });
    return createObject(
      jsonObject({
        url: url.toString(),
        title: optionalString(input.title),
        tags: tagBody(input.tags),
        spaces: spaceBody(input.spaceIds),
      }),
      context,
    );
  },

  create_note(input, context) {
    return createObject(
      jsonObject({
        content: { type: markdownMediaType, body: requiredString(input.content, "content", providerInputError) },
        title: optionalString(input.title),
        tags: tagBody(input.tags),
        spaces: spaceBody(input.spaceIds),
      }),
      context,
    );
  },

  async update_object(input, context) {
    const objectId = requiredString(input.objectId, "objectId", providerInputError);
    await requestJson(
      `/objects/${encodePathSegment(objectId)}`,
      {
        method: "PATCH",
        json: jsonObject({
          title: optionalString(input.title),
          summary: optionalString(input.summary),
          completed: optionalBoolean(input.completed),
        }),
      },
      context,
      "execute",
    );
    return { objectId, acknowledged: true };
  },

  async update_object_content(input, context) {
    const objectId = requiredString(input.objectId, "objectId", providerInputError);
    await requestJson(
      `/objects/${encodePathSegment(objectId)}/content`,
      {
        method: "PUT",
        text: { contentType: markdownMediaType, body: requiredString(input.content, "content", providerInputError) },
      },
      context,
      "execute",
    );
    return { objectId, acknowledged: true };
  },

  async delete_object(input, context) {
    const objectId = requiredString(input.objectId, "objectId", providerInputError);
    await requestJson(`/objects/${encodePathSegment(objectId)}`, { method: "DELETE" }, context, "execute");
    return { objectId, acknowledged: true };
  },

  async restore_object(input, context) {
    const objectId = requiredString(input.objectId, "objectId", providerInputError);
    await requestJson(`/objects/${encodePathSegment(objectId)}/restore`, { method: "POST" }, context, "execute");
    return { objectId, acknowledged: true };
  },

  async pin_object(input, context) {
    const objectId = requiredString(input.objectId, "objectId", providerInputError);
    await requestJson(
      `/objects/${encodePathSegment(objectId)}/pin`,
      { method: "POST", json: jsonObject({ position: optionalInteger(input.position) }) },
      context,
      "execute",
    );
    return { objectId, acknowledged: true };
  },

  async unpin_object(input, context) {
    const objectId = requiredString(input.objectId, "objectId", providerInputError);
    await requestJson(`/objects/${encodePathSegment(objectId)}/pin`, { method: "DELETE" }, context, "execute");
    return { objectId, acknowledged: true };
  },

  async create_object_note(input, context) {
    const objectId = requiredString(input.objectId, "objectId", providerInputError);
    const payload = await requestJson(
      `/objects/${encodePathSegment(objectId)}/notes`,
      {
        method: "POST",
        text: { contentType: markdownMediaType, body: requiredString(input.content, "content", providerInputError) },
      },
      context,
      "execute",
    );
    const noteId = optionalString(optionalRecord(payload)?.id);
    if (!noteId) {
      throw new ProviderRequestError(502, "mymind did not return an id for the new note");
    }
    return { objectId, noteId };
  },

  async update_object_note(input, context) {
    const noteId = requiredString(input.noteId, "noteId", providerInputError);
    await requestJson(
      `/objects/${objectPath(input)}/notes/${encodePathSegment(noteId)}`,
      {
        method: "PUT",
        text: { contentType: markdownMediaType, body: requiredString(input.content, "content", providerInputError) },
      },
      context,
      "execute",
    );
    return { noteId, acknowledged: true };
  },

  async delete_object_note(input, context) {
    const noteId = requiredString(input.noteId, "noteId", providerInputError);
    await requestJson(
      `/objects/${objectPath(input)}/notes/${encodePathSegment(noteId)}`,
      { method: "DELETE" },
      context,
      "execute",
    );
    return { noteId, acknowledged: true };
  },

  async list_tags(input, context) {
    const payload = await requestJson(
      "/tags",
      { method: "GET", query: { limit: numberParam(input.limit) } },
      context,
      "execute",
    );
    return { tags: optionalObjectArray(payload, "tag") };
  },

  async add_object_tags(input, context) {
    const objectId = requiredString(input.objectId, "objectId", providerInputError);
    await requestJson(
      `/objects/${encodePathSegment(objectId)}/tags`,
      { method: "POST", json: requiredTagBody(input.tags) },
      context,
      "execute",
    );
    return { objectId, acknowledged: true };
  },

  async remove_object_tags(input, context) {
    const objectId = requiredString(input.objectId, "objectId", providerInputError);
    await requestJson(
      `/objects/${encodePathSegment(objectId)}/tags`,
      { method: "DELETE", json: requiredTagBody(input.tags) },
      context,
      "execute",
    );
    return { objectId, acknowledged: true };
  },

  async list_spaces(_input, context) {
    const payload = await requestJson("/spaces", { method: "GET" }, context, "execute");
    return { spaces: optionalObjectArray(payload, "space") };
  },

  get_space(input, context) {
    return requestJson(`/spaces/${spacePath(input)}`, { method: "GET" }, context, "execute");
  },

  create_space(input, context) {
    return requestJson(
      "/spaces",
      {
        method: "POST",
        json: jsonObject({
          name: requiredString(input.name, "name", providerInputError),
          color: optionalString(input.color),
          objects: spaceBody(input.objectIds),
        }),
      },
      context,
      "execute",
    );
  },

  update_space(input, context) {
    return requestJson(
      `/spaces/${spacePath(input)}`,
      {
        method: "PATCH",
        json: jsonObject({ name: optionalString(input.name), color: optionalString(input.color) }),
      },
      context,
      "execute",
    );
  },

  async delete_space(input, context) {
    const spaceId = requiredString(input.spaceId, "spaceId", providerInputError);
    await requestJson(`/spaces/${encodePathSegment(spaceId)}`, { method: "DELETE" }, context, "execute");
    return { spaceId, acknowledged: true };
  },

  async add_object_to_space(input, context) {
    const spaceId = requiredString(input.spaceId, "spaceId", providerInputError);
    await requestJson(
      `/spaces/${encodePathSegment(spaceId)}/objects/${objectPath(input)}`,
      { method: "PUT" },
      context,
      "execute",
    );
    return { spaceId, acknowledged: true };
  },

  async remove_object_from_space(input, context) {
    const spaceId = requiredString(input.spaceId, "spaceId", providerInputError);
    await requestJson(
      `/spaces/${encodePathSegment(spaceId)}/objects/${objectPath(input)}`,
      { method: "DELETE" },
      context,
      "execute",
    );
    return { spaceId, acknowledged: true };
  },

  async list_links(_input, context) {
    const payload = await requestJson("/links", { method: "GET" }, context, "execute");
    return { links: optionalObjectArray(payload, "link") };
  },

  async create_link(input, context) {
    const { payload, status } = await requestJsonWithStatus(
      "/links",
      {
        method: "POST",
        json: {
          sourceId: requiredString(input.sourceId, "sourceId", providerInputError),
          targetId: requiredString(input.targetId, "targetId", providerInputError),
        },
      },
      context,
      "execute",
    );
    return { link: payload, created: status === 201 };
  },

  async delete_link(input, context) {
    const linkId = requiredString(input.linkId, "linkId", providerInputError);
    await requestJson(`/links/${encodePathSegment(linkId)}`, { method: "DELETE" }, context, "execute");
    return { linkId, acknowledged: true };
  },
};

export const executors: ProviderExecutors = defineProviderExecutors<MyMindContext>({
  service,
  skipDnsValidation: true,
  handlers: myMindActionHandlers,
  fallbackMessage: "mymind request failed",
  async createContext(context: ExecutionContext, fetcher: typeof fetch): Promise<MyMindContext> {
    const credential = await requireCustomCredential(context, service);
    return { ...readAccessKey(credential.values), fetcher, signal: context.signal };
  },
});

export const credentialValidators: CredentialValidators = {
  async customCredential(input, { fetcher, signal }) {
    const accessKey = readAccessKey(input.values);
    await requestJson("/tags", { method: "GET" }, { ...accessKey, fetcher, signal }, "validate");

    return {
      profile: {
        accountId: accessKey.keyId,
        displayName: `mymind key ${accessKey.keyId}`,
      },
      // mymind exposes no endpoint that reports a key's access level, so
      // there is nothing to derive this from. Left empty rather than guessed;
      // the runtime does not gate execution on requiredScopes vs grantedScopes,
      // so an empty list here does not block any action.
      grantedScopes: [],
      metadata: { apiBaseUrl: myMindApiBaseUrl, validationEndpoint: "/tags" },
    };
  },
};

function readAccessKey(values: Record<string, string>): MyMindAccessKey {
  return {
    keyId: requiredString(values.keyId, "keyId", providerInputError),
    keySecret: base64Bytes(values.keySecret, "keySecret", providerInputError),
  };
}

function objectPath(input: Record<string, unknown>): string {
  return encodePathSegment(requiredString(input.objectId, "objectId", providerInputError));
}

function spacePath(input: Record<string, unknown>): string {
  return encodePathSegment(requiredString(input.spaceId, "spaceId", providerInputError));
}

function flag(value: unknown): string | undefined {
  return optionalBoolean(value) === true ? "true" : undefined;
}

function numberParam(value: unknown): string | undefined {
  const parsed = optionalNumber(value);
  return parsed === undefined ? undefined : String(parsed);
}

function tagBody(value: unknown): Array<{ name: string }> | undefined {
  const names = optionalStringArray(value);
  return names?.length ? names.map((name) => ({ name })) : undefined;
}

function requiredTagBody(value: unknown): Array<{ name: string }> {
  const tags = tagBody(value);
  if (!tags) {
    throw providerInputError("tags must contain at least one tag name");
  }
  return tags;
}

function spaceBody(value: unknown): Array<{ id: string }> | undefined {
  const ids = optionalStringArray(value);
  return ids?.length ? ids.map((id) => ({ id })) : undefined;
}

async function createObject(body: Record<string, unknown>, context: MyMindContext): Promise<unknown> {
  // mymind answers 201 for a new object and 200 when the save matched one the
  // mind already holds, so the status is the only signal that it was a duplicate.
  const { payload, status } = await requestJsonWithStatus(
    "/objects",
    { method: "POST", json: body },
    context,
    "execute",
  );
  return { object: payload, created: status === 201 };
}

async function readObjects(objectIds: string[], context: MyMindContext): Promise<Array<Record<string, unknown>>> {
  if (objectIds.length === 0) {
    return [];
  }

  const payload = await requestJson(
    "/objects",
    { method: "GET", query: { id: objectIds, limit: String(objectIds.length) } },
    context,
    "execute",
  );
  return optionalObjectArray(payload, "object");
}

/**
 * Sign the short-lived JWT mymind expects for one request.
 *
 * The token is bound to the method and path it was signed for, so it cannot be
 * replayed against another endpoint, and every request gets a fresh one.
 */
async function signRequestToken(path: string, method: string, accessKey: MyMindAccessKey): Promise<string> {
  const issuedAt = Math.floor(Date.now() / 1000);
  return new SignJWT({ path, method })
    .setProtectedHeader({ alg: "HS256", kid: accessKey.keyId })
    .setIssuedAt(issuedAt)
    .setExpirationTime(issuedAt + accessTokenTtlSeconds)
    .sign(accessKey.keySecret);
}

async function send(
  path: string,
  init: MyMindRequest,
  context: MyMindContext,
  phase: RequestPhase,
): Promise<{ response: Response; timeout: ReturnType<typeof createProviderTimeout> }> {
  const timeout = createProviderTimeout(context.signal, requestTimeoutMs);
  const url = new URL(`${myMindApiBaseUrl}${path}`);
  for (const [name, value] of Object.entries(init.query ?? {})) {
    for (const item of Array.isArray(value) ? value : value === undefined ? [] : [value]) {
      url.searchParams.append(name, item);
    }
  }

  const headers: Record<string, string> = {
    accept: init.accept ?? "application/json",
    authorization: `Bearer ${await signRequestToken(path, init.method, context)}`,
    "user-agent": providerUserAgent,
  };
  let body: string | undefined;
  if (init.text) {
    headers["content-type"] = init.text.contentType;
    body = init.text.body;
  } else if (init.json !== undefined) {
    headers["content-type"] = "application/json";
    body = JSON.stringify(init.json);
  }

  try {
    const response = await context.fetcher(url, { method: init.method, headers, body, signal: timeout.signal });
    if (!response.ok) {
      throw await createRequestError(response, phase);
    }
    return { response, timeout };
  } catch (error) {
    timeout.cleanup();
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    if (timeout.didTimeout() || isAbortSignalError(timeout.signal, error)) {
      throw new ProviderRequestError(504, "mymind request timed out");
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `mymind request failed: ${error.message}` : "mymind request failed",
    );
  }
}

async function requestJsonWithStatus(
  path: string,
  init: MyMindRequest,
  context: MyMindContext,
  phase: RequestPhase,
): Promise<{ payload: unknown; status: number }> {
  const { response, timeout } = await send(path, init, context, phase);
  try {
    const payload = await readProviderJsonBody(response, {
      emptyBody: {},
      invalidJsonMessage: "mymind returned a non-JSON response",
    });
    return { payload, status: response.status };
  } finally {
    timeout.cleanup();
  }
}

async function requestJson(
  path: string,
  init: MyMindRequest,
  context: MyMindContext,
  phase: RequestPhase,
): Promise<unknown> {
  return (await requestJsonWithStatus(path, init, context, phase)).payload;
}

async function requestText(
  path: string,
  init: MyMindRequest,
  context: MyMindContext,
  phase: RequestPhase,
): Promise<string> {
  const { response, timeout } = await send(path, init, context, phase);
  try {
    return await readProviderTextBody(response, "mymind content response");
  } finally {
    timeout.cleanup();
  }
}

/**
 * Map a mymind failure onto a stable execution error.
 *
 * mymind reports failures as RFC 9457 problem documents, but it words them in
 * more than one way: a single `detail` for most failures, and a list of
 * `errors` for a validation failure. Reading only `detail` would reduce the
 * useful half of them to a bare status code.
 */
async function createRequestError(response: Response, phase: RequestPhase): Promise<ProviderRequestError> {
  const problem = optionalRecord(
    await readProviderJsonBody(response, {
      emptyBody: {},
      invalidJsonMessage: "mymind returned a non-JSON error",
      invalidJsonFallback: (text) => ({ detail: text }),
    }),
  );
  const message =
    optionalString(problem?.detail) ??
    readProblemErrors(problem) ??
    optionalString(problem?.title) ??
    optionalString(problem?.type) ??
    `mymind request failed with status ${response.status}`;

  if (response.status === 401 || response.status === 403) {
    return phase === "validate"
      ? providerInputError(`mymind rejected the access key: ${message}`)
      : new ProviderRequestError(response.status, message, problem);
  }
  if (response.status === 429) {
    return new ProviderRequestError(429, describeRateLimit(response, message), problem);
  }
  if (response.status >= 400 && response.status < 500) {
    // Keep the real status (404, 422, ...) rather than flattening every
    // client error to 400: toProviderExecutionError still reports all of
    // these as "invalid_input", but callers that branch on error.status
    // — like the missing-content check above — need the original code.
    return new ProviderRequestError(response.status, message, problem);
  }
  return new ProviderRequestError(response.status || 502, message, problem);
}

/** Join the per-field messages mymind lists in a validation problem document. */
function readProblemErrors(problem: Record<string, unknown> | undefined): string | undefined {
  const messages = optionalObjectArray(problem?.errors, "problem error")
    .map((entry) => optionalString(entry.message))
    .filter((entry): entry is string => entry !== undefined);
  return messages.length > 0 ? messages.join("; ") : undefined;
}

/**
 * mymind meters usage in credits across a burst and a sustained window and
 * reports both in the RateLimit header, so the header is worth surfacing: it
 * tells a caller how long to wait rather than just that it was throttled.
 */
function describeRateLimit(response: Response, message: string): string {
  const policy = response.headers.get("ratelimit");
  if (!policy) {
    return message;
  }

  const retryAfterSeconds = Math.max(
    0,
    ...policy
      .split(",")
      .filter((entry) => /(?:^|;)\s*r=0(?:;|$)/u.test(entry))
      .map((entry) => Number(/(?:^|;)\s*t=(\d+)(?:;|$)/u.exec(entry)?.[1]))
      .filter(Number.isFinite),
  );
  return retryAfterSeconds > 0
    ? `${message} Retry after approximately ${retryAfterSeconds} seconds. (RateLimit: ${policy})`
    : `${message} (RateLimit: ${policy})`;
}
