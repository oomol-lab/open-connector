import type { CredentialValidators, ExecutionContext, ProviderExecutors } from "../../core/types.ts";
import type { ApiBibleActionName } from "./actions.ts";

import { compactObject, optionalRecord, optionalString } from "../../core/cast.ts";
import {
  defineProviderExecutors,
  providerUserAgent,
  ProviderRequestError,
  requireApiKeyCredential,
} from "../provider-runtime.ts";

const service = "api_bible";
const apiBibleApiBaseUrl = "https://api.scripture.api.bible";
const apiBibleValidationPath = "/v1/bibles";

type ApiBibleRequestPhase = "validate" | "execute";

interface ApiBibleActionContext {
  apiKey: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

type ApiBibleActionHandler = (input: Record<string, unknown>, context: ApiBibleActionContext) => Promise<unknown>;

export const apiBibleActionHandlers: Record<ApiBibleActionName, ApiBibleActionHandler> = {
  list_bibles(input, context) {
    return listBibles(input, context);
  },
  list_books(input, context) {
    return listBooks(input, context);
  },
  list_chapters(input, context) {
    return listChapters(input, context);
  },
  get_chapter(input, context) {
    return getChapter(input, context);
  },
  list_verses(input, context) {
    return listVerses(input, context);
  },
  get_verse(input, context) {
    return getVerse(input, context);
  },
  get_passage(input, context) {
    return getPassage(input, context);
  },
  search_scripture(input, context) {
    return searchScripture(input, context);
  },
};

export const executors: ProviderExecutors = defineProviderExecutors<ApiBibleActionContext>({
  service,
  handlers: apiBibleActionHandlers,
  async createContext(context: ExecutionContext, fetcher: typeof fetch): Promise<ApiBibleActionContext> {
    const credential = await requireApiKeyCredential(context, service);
    return {
      apiKey: credential.apiKey,
      fetcher,
      signal: context.signal,
    };
  },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const payload = await requestApiBibleJson({
      path: apiBibleValidationPath,
      query: {},
      apiKey: input.apiKey,
      fetcher,
      signal,
      phase: "validate",
    });

    const data = readDataArray(payload);
    const firstBible = optionalRecord(data[0]);

    return {
      profile: {
        accountId: "api_key",
        displayName: "API.Bible API Key",
      },
      grantedScopes: [],
      metadata: compactObject({
        validationEndpoint: apiBibleValidationPath,
        apiBaseUrl: apiBibleApiBaseUrl,
        firstBibleId: optionalString(firstBible?.id),
        firstBibleName: optionalString(firstBible?.name),
        firstBibleLanguage: optionalString(optionalRecord(firstBible?.language)?.id),
      }),
    };
  },
};

function listBibles(input: Record<string, unknown>, context: ApiBibleActionContext): Promise<unknown> {
  return requestApiBibleJson({
    path: "/v1/bibles",
    query: compactObject({
      language: optionalString(input.language),
      abbreviation: optionalString(input.abbreviation),
      name: optionalString(input.name),
    }),
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
  }).then((payload) => ({ bibles: readDataArray(payload) }));
}

function listBooks(input: Record<string, unknown>, context: ApiBibleActionContext): Promise<unknown> {
  return requestApiBibleJson({
    path: `/v1/bibles/${encodeURIComponent(String(input.bibleId))}/books`,
    query: {},
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
  }).then((payload) => ({ books: readDataArray(payload) }));
}

function listChapters(input: Record<string, unknown>, context: ApiBibleActionContext): Promise<unknown> {
  return requestApiBibleJson({
    path: `/v1/bibles/${encodeURIComponent(String(input.bibleId))}/books/${encodeURIComponent(String(input.bookId))}/chapters`,
    query: {},
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
  }).then((payload) => ({ chapters: readDataArray(payload) }));
}

async function getChapter(input: Record<string, unknown>, context: ApiBibleActionContext): Promise<unknown> {
  const payload = await requestApiBibleJson({
    path: `/v1/bibles/${encodeURIComponent(String(input.bibleId))}/chapters/${encodeURIComponent(String(input.chapterId))}`,
    query: buildDisplayQuery(input),
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
  });

  return {
    chapter: readDataObject(payload),
    meta: readMetaObject(payload),
  };
}

function listVerses(input: Record<string, unknown>, context: ApiBibleActionContext): Promise<unknown> {
  return requestApiBibleJson({
    path: `/v1/bibles/${encodeURIComponent(String(input.bibleId))}/chapters/${encodeURIComponent(String(input.chapterId))}/verses`,
    query: {},
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
  }).then((payload) => ({ verses: readDataArray(payload) }));
}

async function getVerse(input: Record<string, unknown>, context: ApiBibleActionContext): Promise<unknown> {
  const payload = await requestApiBibleJson({
    path: `/v1/bibles/${encodeURIComponent(String(input.bibleId))}/verses/${encodeURIComponent(String(input.verseId))}`,
    query: buildDisplayQuery(input),
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
  });

  return {
    verse: readDataObject(payload),
    meta: readMetaObject(payload),
  };
}

async function getPassage(input: Record<string, unknown>, context: ApiBibleActionContext): Promise<unknown> {
  const payload = await requestApiBibleJson({
    path: `/v1/bibles/${encodeURIComponent(String(input.bibleId))}/passages/${encodeURIComponent(String(input.passageId))}`,
    query: buildDisplayQuery(input),
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
  });

  return {
    passage: readDataObject(payload),
    meta: readMetaObject(payload),
  };
}

async function searchScripture(input: Record<string, unknown>, context: ApiBibleActionContext): Promise<unknown> {
  const payload = await requestApiBibleJson({
    path: `/v1/bibles/${encodeURIComponent(String(input.bibleId))}/search`,
    query: compactObject({
      query: requireResponseString(input.query, "query"),
      limit: stringifyOptionalNumber(input.limit),
      offset: stringifyOptionalNumber(input.offset),
    }),
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
  });

  const data = readDataObject(payload);
  const hasVerses = Object.prototype.hasOwnProperty.call(data, "verses");
  const hasPassages = Object.prototype.hasOwnProperty.call(data, "passages");
  return compactObject({
    query: requireResponseString(data.query, "query"),
    limit: requireResponseInteger(data.limit, "limit"),
    offset: requireResponseInteger(data.offset, "offset"),
    total: requireResponseInteger(data.total, "total"),
    resultType: hasPassages ? "passages" : "verses",
    verses: readOptionalArray(data.verses, "verses", hasVerses),
    passages: readOptionalArray(data.passages, "passages", hasPassages),
    meta: readMetaObject(payload),
  });
}

function buildDisplayQuery(input: Record<string, unknown>): Record<string, string | undefined> {
  return compactObject({
    parallels: optionalString(input.parallels),
    "content-type": optionalString(input.contentType),
    "include-notes": stringifyOptionalBoolean(input.includeNotes),
    "include-titles": stringifyOptionalBoolean(input.includeTitles),
    "include-verse-spans": stringifyOptionalBoolean(input.includeVerseSpans),
    "include-verse-numbers": stringifyOptionalBoolean(input.includeVerseNumbers),
    "include-chapter-numbers": stringifyOptionalBoolean(input.includeChapterNumbers),
    "use-org-id": stringifyOptionalBoolean(input.useOrgId),
  });
}

async function requestApiBibleJson(input: {
  path: string;
  query: Record<string, string | undefined>;
  apiKey: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
  phase: ApiBibleRequestPhase;
}): Promise<Record<string, unknown>> {
  let response: Response;
  try {
    response = await input.fetcher(buildApiBibleUrl(input.path, input.query), {
      method: "GET",
      headers: {
        accept: "application/json",
        "api-key": input.apiKey,
        "user-agent": providerUserAgent,
      },
      signal: input.signal,
    });
  } catch (error) {
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `API.Bible request failed: ${error.message}` : "API.Bible request failed",
    );
  }

  const payload = await readApiBiblePayload(response);
  if (!response.ok) {
    throw buildApiBibleError(response.status, payload, input.phase);
  }

  return payload;
}

function buildApiBibleUrl(path: string, query: Record<string, string | undefined>): URL {
  const url = new URL(path, apiBibleApiBaseUrl);
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) {
      url.searchParams.set(key, value);
    }
  }
  return url;
}

async function readApiBiblePayload(response: Response): Promise<Record<string, unknown>> {
  const text = await response.text().catch(() => "");
  if (!text.trim()) {
    return {
      message: `API.Bible request failed with status ${response.status}`,
    };
  }

  try {
    const payload = JSON.parse(text) as unknown;
    return optionalRecord(payload) ?? {
      message: `API.Bible request failed with status ${response.status}`,
    };
  } catch {
    return {
      message: text || `API.Bible request failed with status ${response.status}`,
    };
  }
}

function buildApiBibleError(
  status: number,
  payload: Record<string, unknown>,
  phase: ApiBibleRequestPhase,
): ProviderRequestError {
  const message =
    optionalString(payload.message) ??
    optionalString(payload.error) ??
    `API.Bible request failed with status ${status}`;

  if (status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if (phase === "validate" && (status === 401 || status === 403)) {
    return new ProviderRequestError(400, message, payload);
  }
  if (phase === "execute" && (status === 401 || status === 403)) {
    return new ProviderRequestError(status, message, payload);
  }
  if (status === 400 || status === 404) {
    return new ProviderRequestError(400, message, payload);
  }

  return new ProviderRequestError(status, message, payload);
}

function readDataArray(payload: Record<string, unknown>): Array<Record<string, unknown>> {
  const data = payload.data;
  if (!Array.isArray(data)) {
    throw new ProviderRequestError(502, "api_bible response field data must be an array", payload);
  }
  return data.map((item) => requireRecord(item, "api_bible response data item", payload));
}

function readDataObject(payload: Record<string, unknown>): Record<string, unknown> {
  return requireRecord(payload.data, "api_bible response field data", payload);
}

function readMetaObject(payload: Record<string, unknown>): Record<string, unknown> | undefined {
  return optionalRecord(payload.meta);
}

function readOptionalArray(
  value: unknown,
  fieldName: string,
  isPresent: boolean,
): Array<Record<string, unknown>> {
  if (!isPresent) {
    return [];
  }
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(502, `api_bible response field ${fieldName} must be an array`);
  }
  return value.map((item) => requireRecord(item, `api_bible response field ${fieldName} item`, value));
}

function requireRecord(value: unknown, message: string, details?: unknown): Record<string, unknown> {
  const record = optionalRecord(value);
  if (!record) {
    throw new ProviderRequestError(502, message, details);
  }
  return record;
}

function requireResponseString(value: unknown, fieldName: string): string {
  const stringValue = optionalString(value);
  if (!stringValue) {
    throw new ProviderRequestError(502, `api_bible response field ${fieldName} must be a string`);
  }
  return stringValue;
}

function requireResponseInteger(value: unknown, fieldName: string): number {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new ProviderRequestError(502, `api_bible response field ${fieldName} must be an integer`);
  }
  return value;
}

function stringifyOptionalBoolean(value: unknown): string | undefined {
  return typeof value === "boolean" ? String(value) : undefined;
}

function stringifyOptionalNumber(value: unknown): string | undefined {
  return typeof value === "number" ? String(value) : undefined;
}
