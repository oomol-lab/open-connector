import type { CredentialValidators, ExecutionContext, ProviderExecutors } from "../../core/types.ts";

import {
  optionalBoolean,
  optionalInteger,
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
  ProviderRequestError,
  providerUserAgent,
  readProviderJsonBody,
  requireCustomCredential,
} from "../provider-runtime.ts";
import { markdownToProse, proseToMarkdown } from "./prose.ts";

const service = "mymind";
const myMindApiBaseUrl = "https://access.mymind.com";
const requestTimeoutMs = 30_000;
/** Bit mymind sets on tags the account owner created, as opposed to the ones it generates automatically. */
const customTagFlag = 8;
const defaultSearchLimit = 20;
const defaultTagLimit = 50;

type RequestPhase = "validate" | "execute";

/**
 * mymind authenticates the web app with its session cookies plus a CSRF-style
 * header, so a connection carries all three values rather than one token.
 */
interface MyMindContext {
  jwt: string;
  cid: string;
  authenticityToken: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

interface MyMindRequest {
  method: string;
  body?: Record<string, unknown>;
}

type ActionHandler = (input: Record<string, unknown>, context: MyMindContext) => Promise<unknown>;

const badRequest = (message: string): ProviderRequestError => new ProviderRequestError(400, message);

export const myMindActionHandlers: Record<string, ActionHandler> = {
  async search_cards(input, context) {
    const query = requiredString(input.query, "query", badRequest);
    const limit = optionalInteger(input.limit) ?? defaultSearchLimit;
    const payload = await requestJson(`/search?q=${encodeURIComponent(query)}`, { method: "GET" }, context, "execute");
    const matches = optionalObjectArray(optionalRecord(payload)?.matches, "search match");

    const cards: unknown[] = [];
    for (const match of matches) {
      if (cards.length >= limit) {
        break;
      }
      const cardId = optionalString(match.id);
      if (cardId) {
        cards.push(await readCard(cardId, context));
      }
    }
    return { matchCount: matches.length, cards };
  },

  get_card(input, context) {
    return readCard(requiredString(input.cardId, "cardId", badRequest), context);
  },

  async get_card_content(input, context) {
    const cardId = requiredString(input.cardId, "cardId", badRequest);
    const card = await requestJson(`/cards/${encodePathSegment(cardId)}`, { method: "GET" }, context, "execute");
    const record = optionalRecord(card);
    return {
      card,
      proseMarkdown: proseToMarkdown(record?.prose),
      noteMarkdown: proseToMarkdown(optionalRecord(record?.note)?.prose),
    };
  },

  async create_note(input, context) {
    const card = await requestJson(
      "/objects",
      {
        method: "POST",
        body: {
          type: "Note",
          title: optionalString(input.title) ?? "",
          prose: {
            type: "doc",
            content: markdownToProse(requiredString(input.content, "content", badRequest)),
          },
        },
      },
      context,
      "execute",
    );
    return { card, tags: await applyTags(card, input.tags, context) };
  },

  async save_url(input, context) {
    const url = assertPublicHttpUrl(requiredString(input.url, "url", badRequest), {
      fieldName: "url",
      createError: badRequest,
    });
    const card = await requestJson(
      "/objects",
      { method: "POST", body: { type: "WebPage", url: url.toString() } },
      context,
      "execute",
    );
    return { card, tags: await applyTags(card, input.tags, context) };
  },

  update_card(input, context) {
    const cardId = requiredString(input.cardId, "cardId", badRequest);
    return requestJson(
      `/objects/${encodePathSegment(cardId)}`,
      { method: "PATCH", body: { title: requiredString(input.title, "title", badRequest) } },
      context,
      "execute",
    );
  },

  async delete_card(input, context) {
    const cardId = requiredString(input.cardId, "cardId", badRequest);
    await requestJson(`/objects/${encodePathSegment(cardId)}`, { method: "DELETE" }, context, "execute");
    return { cardId, deleted: true };
  },

  async list_tags(input, context) {
    const payload = await requestJson("/tags", { method: "GET" }, context, "execute");
    const tags = optionalObjectArray(payload, "tag");
    const selected =
      optionalBoolean(input.customOnly) === true
        ? tags.filter((tag) => optionalInteger(tag.flags) === customTagFlag)
        : tags;
    return { tags: selected.slice(0, optionalInteger(input.limit) ?? defaultTagLimit) };
  },

  async get_card_tags(input, context) {
    const cardId = requiredString(input.cardId, "cardId", badRequest);
    return { cardId, tags: await readCardTags(cardId, context) };
  },

  async add_card_tag(input, context) {
    const cardId = requiredString(input.cardId, "cardId", badRequest);
    await requestJson(
      `/objects/${encodePathSegment(cardId)}/tags`,
      { method: "POST", body: { name: requiredString(input.tag, "tag", badRequest) } },
      context,
      "execute",
    );
    return { cardId, tags: await readCardTags(cardId, context) };
  },

  async remove_card_tag(input, context) {
    const cardId = requiredString(input.cardId, "cardId", badRequest);
    await requestJson(
      `/objects/${encodePathSegment(cardId)}/tags`,
      { method: "DELETE", body: { name: requiredString(input.tag, "tag", badRequest) } },
      context,
      "execute",
    );
    return { cardId, tags: await readCardTags(cardId, context) };
  },

  async list_spaces(_input, context) {
    const payload = await requestJson("/spaces", { method: "GET" }, context, "execute");
    return { spaces: optionalObjectArray(payload, "space") };
  },

  get_space(input, context) {
    const spaceId = requiredString(input.spaceId, "spaceId", badRequest);
    return requestJson(`/spaces/${encodePathSegment(spaceId)}`, { method: "GET" }, context, "execute");
  },

  create_space(input, context) {
    const filters = optionalStringArray(input.filters);
    return requestJson(
      "/spaces",
      {
        method: "POST",
        body: jsonObject({
          name: requiredString(input.name, "name", badRequest),
          color: optionalString(input.color),
          query: filters?.length ? { filters } : undefined,
        }),
      },
      context,
      "execute",
    );
  },

  async delete_space(input, context) {
    const spaceId = requiredString(input.spaceId, "spaceId", badRequest);
    await requestJson(`/spaces/${encodePathSegment(spaceId)}`, { method: "DELETE" }, context, "execute");
    return { spaceId, deleted: true };
  },
};

export const executors: ProviderExecutors = defineProviderExecutors<MyMindContext>({
  service,
  skipDnsValidation: true,
  handlers: myMindActionHandlers,
  fallbackMessage: "mymind request failed",
  async createContext(context: ExecutionContext, fetcher: typeof fetch): Promise<MyMindContext> {
    const credential = await requireCustomCredential(context, service);
    return {
      ...readSessionValues(credential.values),
      fetcher,
      signal: context.signal,
    };
  },
});

export const credentialValidators: CredentialValidators = {
  async customCredential(input, { fetcher, signal }) {
    await requestJson("/tags", { method: "GET" }, { ...readSessionValues(input.values), fetcher, signal }, "validate");

    return {
      grantedScopes: [],
      metadata: { apiBaseUrl: myMindApiBaseUrl, validationEndpoint: "/tags" },
    };
  },
};

function readSessionValues(values: Record<string, string>): Pick<MyMindContext, "jwt" | "cid" | "authenticityToken"> {
  return {
    jwt: requiredString(values.jwt, "jwt", badRequest),
    cid: requiredString(values.cid, "cid", badRequest),
    authenticityToken: requiredString(values.authenticityToken, "authenticityToken", badRequest),
  };
}

function readCard(cardId: string, context: MyMindContext): Promise<unknown> {
  return requestJson(`/objects/${encodePathSegment(cardId)}`, { method: "GET" }, context, "execute");
}

async function readCardTags(cardId: string, context: MyMindContext): Promise<Array<Record<string, unknown>>> {
  const payload = await requestJson(
    `/objects/${encodePathSegment(cardId)}/tags`,
    { method: "GET" },
    context,
    "execute",
  );
  return optionalObjectArray(payload, "tag");
}

/**
 * Apply the requested tags to a card mymind just created.
 *
 * mymind only accepts tags on an existing card, so creating a tagged card is
 * always a create call followed by one tag call per tag.
 */
async function applyTags(card: unknown, tagsInput: unknown, context: MyMindContext): Promise<string[]> {
  const tags = optionalStringArray(tagsInput) ?? [];
  if (tags.length === 0) {
    return [];
  }

  const cardId = optionalString(optionalRecord(card)?.id);
  if (!cardId) {
    throw new ProviderRequestError(502, "mymind did not return an id for the new card");
  }

  for (const tag of tags) {
    await requestJson(
      `/objects/${encodePathSegment(cardId)}/tags`,
      { method: "POST", body: { name: tag } },
      context,
      "execute",
    );
  }
  return tags;
}

async function requestJson(
  path: string,
  init: MyMindRequest,
  context: MyMindContext,
  phase: RequestPhase,
): Promise<unknown> {
  const timeout = createProviderTimeout(context.signal, requestTimeoutMs);
  const headers: Record<string, string> = {
    accept: "application/json",
    cookie: `_cid=${context.cid}; _jwt=${context.jwt}`,
    "x-authenticity-token": context.authenticityToken,
    "user-agent": providerUserAgent,
  };
  if (init.body !== undefined) {
    headers["content-type"] = "application/json";
  }

  try {
    const response = await context.fetcher(`${myMindApiBaseUrl}${path}`, {
      method: init.method,
      headers,
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      // mymind redirects to its sign-in page when the session is stale instead of
      // answering with 401, so the redirect is read as an auth failure rather
      // than followed into an HTML login page.
      redirect: "manual",
      signal: timeout.signal,
    });
    if (isRedirect(response.status)) {
      throw createSessionExpiredError(phase);
    }

    const payload = await readProviderJsonBody(response, {
      emptyBody: {},
      invalidJsonMessage: "mymind returned a non-JSON response",
    });
    if (!response.ok) {
      throw createRequestError(response, payload, phase);
    }
    return payload;
  } catch (error) {
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
  } finally {
    timeout.cleanup();
  }
}

function isRedirect(status: number): boolean {
  return status >= 300 && status < 400;
}

function createSessionExpiredError(phase: RequestPhase): ProviderRequestError {
  const message = "mymind rejected the session values. Sign in again and reconnect with fresh values.";
  return new ProviderRequestError(phase === "validate" ? 400 : 401, message);
}

function createRequestError(response: Response, payload: unknown, phase: RequestPhase): ProviderRequestError {
  const object = optionalRecord(payload);
  const message =
    optionalString(object?.error) ??
    optionalString(object?.message) ??
    `mymind request failed with status ${response.status}`;

  if (response.status === 401 || response.status === 403) {
    return phase === "validate"
      ? createSessionExpiredError(phase)
      : new ProviderRequestError(response.status, message, payload);
  }
  if (response.status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if (response.status >= 400 && response.status < 500) {
    return new ProviderRequestError(400, message, payload);
  }
  return new ProviderRequestError(response.status || 502, message, payload);
}
