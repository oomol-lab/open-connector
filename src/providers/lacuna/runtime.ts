import type { ProviderActionHandlers, ProviderRuntimeHandler } from "../provider-executors.ts";
import type { ProviderFetch } from "../provider-runtime.ts";

import { optionalBoolean, optionalInteger, optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import {
  ProviderRequestError,
  providerInputError,
  providerResponseError,
  providerUserAgent,
  readProviderJsonBody,
  runProviderRequest,
  setSearchParams,
} from "../provider-runtime.ts";

export const lacunaBaseUrl = "https://lacuna.tiptreesystems.com";
const lacunaOrigin = new URL(lacunaBaseUrl).origin;
const retryableStatuses = new Set([429, 502, 503, 504]);
const maxRetries = 2;
const maxResponseBytes = 8 * 1024 * 1024;

const searchTypeAliases: Record<string, string> = {
  all: "all",
  paper: "paper",
  papers: "paper",
  cluster: "cluster",
  clusters: "cluster",
  direction: "cluster",
  directions: "cluster",
  author: "author",
  authors: "author",
  institution: "institution",
  institutions: "institution",
  venue: "venue",
  venues: "venue",
  hypothesis: "hypothesis",
  hypotheses: "hypothesis",
  proposal: "hypothesis",
  proposals: "hypothesis",
};
const rankingAliases: Record<string, string> = {
  default: "default",
  lexical: "default",
  semantic: "semantic",
  bm25: "bm25_title_abstract",
  bm25_title_abstract: "bm25_title_abstract",
};
// Lexical fields the Lacuna ranker accepts, mapped to the search types whose
// documents actually carry them. Requesting a field the target type lacks makes
// the server match nothing on that leg and silently fall back to substring
// ranking, so the combination is rejected locally instead.
const searchFieldTypes = new Map<string, ReadonlySet<string>>([
  ["title", new Set(["paper", "cluster", "venue", "hypothesis"])],
  ["abstract", new Set(["paper"])],
  ["summary", new Set(["paper"])],
  ["concepts", new Set(["paper"])],
  ["name", new Set(["author", "institution", "venue"])],
  ["top_names", new Set(["cluster", "hypothesis"])],
  ["venue", new Set(["paper", "venue"])],
]);
// The leading `(?<!\w)` keeps paths inside absolute third-party URLs
// (`https://arxiv.org/pdf/x`) from being rewritten onto the Lacuna origin.
const markdownPathPattern =
  /(?<!\w)\/(?:author|cluster|direction|figures|hypothesis|institution|node|paper|pdf|venue)\/[^\s)\]"'>]+/g;
const markdownTrailingPunctuationPattern = /[.,;:]+$/;
const partialDatePattern = /^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?$/;
// Live direction URLs fuse the id into the slug (`/direction/{slug}-{id}`) and
// may carry a trailing `/md` Markdown segment.
const directionRoutePattern = /\/(?:direction|cluster)\/(?:[^/?#]*-)?(\d+)(?:[/?#]|$)/;
const trailingNumericSegmentPattern = /(?:^|\/)(\d+)\/?$/;
const hypothesisRoutePattern = /\/hypothesis\/([^/?#]+)/;
const hypothesisIdPattern = /([0-9a-fA-F]{16})$/;
const routeIdPattern = /^[A-Za-z0-9_.:-]+$/;

export interface LacunaActionContext {
  fetcher: ProviderFetch;
  signal?: AbortSignal;
  sleep?(delayMs: number, signal?: AbortSignal): Promise<void>;
}

interface PartialDate {
  value: string;
  earliestDay: number;
  latestDay: number;
}

export const lacunaActionHandlers: ProviderActionHandlers<"lacuna", ProviderRuntimeHandler<LacunaActionContext>> = {
  async search(input, context): Promise<unknown> {
    const query = requiredString(input.query, "query", providerInputError);
    const searchType = readAlias(input.searchType, "searchType", searchTypeAliases, "all");
    const rankingProfile = readAlias(input.rankingProfile, "rankingProfile", rankingAliases, "default");
    const sort = readEnum(input.sort, "sort", ["relevance", "year_desc", "year_asc"], "relevance");
    const fields = optionalString(input.fields);
    const dateFrom = readPartialDate(input.dateFrom, "dateFrom");
    const dateTo = readPartialDate(input.dateTo, "dateTo");
    validateDateRange(dateFrom, dateTo);
    validateSearchOptions(searchType, rankingProfile, sort, fields);

    const limit = readBoundedInteger(input.limit, "limit", 1, 50, 10);
    const offset = readBoundedInteger(input.offset, "offset", 0, Number.MAX_SAFE_INTEGER, 0);
    return requestLacunaJson(
      "/api/v1/search",
      {
        q: query,
        type: searchType,
        limit: String(limit),
        offset: String(offset),
        sort,
        ranking_profile: rankingProfile,
        date_from: dateFrom?.value,
        date_to: dateTo?.value,
        venue: readOptionalText(input.venue, "venue"),
        fields,
      },
      context,
    );
  },

  async get_paper(input, context): Promise<unknown> {
    const paperId = readPaperId(input.paperIdOrUrl);
    const view = readEnum(
      input.view,
      "view",
      ["context", "full", "preview", "blog", "figures", "concepts", "neighbors"],
      "context",
    );
    const path =
      view === "context"
        ? `/api/v1/context/paper/${encodeURIComponent(paperId)}`
        : view === "full"
          ? `/api/v1/papers/${encodeURIComponent(paperId)}`
          : `/api/v1/papers/${encodeURIComponent(paperId)}/${view}`;
    const query: Record<string, string | undefined> = {};
    if (view === "context") {
      query.view = "compact";
      const figureLimit = readOptionalBoundedInteger(input.figureLimit, "figureLimit", 0, Number.MAX_SAFE_INTEGER);
      if (figureLimit !== undefined) query.figure_limit = String(figureLimit);
    }
    return { ...(await requestLacunaJson(path, query, context)), artifact_id: paperId };
  },

  async get_direction(input, context): Promise<unknown> {
    const directionId = readDirectionId(input.directionIdOrUrl);
    const view = readEnum(input.view, "view", ["context", "full"], "context");
    const path = view === "context" ? `/api/v1/context/direction/${directionId}` : `/api/v1/clusters/${directionId}`;
    const query = view === "context" ? { view: "compact" } : {};
    return { ...(await requestLacunaJson(path, query, context)), cluster_id: directionId };
  },

  async get_direction_papers(input, context): Promise<unknown> {
    const directionId = readDirectionId(input.directionIdOrUrl);
    const page = readBoundedInteger(input.page, "page", 1, Number.MAX_SAFE_INTEGER, 1);
    const limit = readBoundedInteger(input.limit, "limit", 1, 100, 24);
    const view = readEnum(input.view, "view", ["compact", "full"], "compact");
    const payload = await requestLacunaJson(
      `/api/v1/clusters/${directionId}/papers`,
      { page: String(page), limit: String(limit), view: view === "full" ? "complete" : "compact" },
      context,
    );
    return { ...payload, cluster_id: directionId };
  },

  async get_author_context(input, context): Promise<unknown> {
    const authorId = readRouteId(input.authorIdOrUrl, "authorIdOrUrl", "author");
    const view = readEnum(input.view, "view", ["context", "full"], "context");
    const includeNeighbors = optionalBoolean(input.includeNeighbors) ?? false;
    const payload = await requestLacunaJson(
      `/api/v1/context/author/${encodeURIComponent(authorId)}`,
      { include_neighbors: String(includeNeighbors), view: view === "context" ? "compact" : undefined },
      context,
    );
    return { ...payload, author_id: authorId };
  },

  async get_hypothesis(input, context): Promise<unknown> {
    const hypothesisId = readHypothesisId(input.hypothesisIdOrUrl);
    const view = readEnum(input.view, "view", ["context", "full"], "context");
    const path =
      view === "context"
        ? `/api/v1/context/hypothesis/${encodeURIComponent(hypothesisId)}`
        : `/api/v1/hypotheses/${encodeURIComponent(hypothesisId)}`;
    const query = view === "context" ? { view: "compact" } : {};
    return { ...(await requestLacunaJson(path, query, context)), hypothesis_id: hypothesisId };
  },
};

async function requestLacunaJson(
  path: string,
  query: Record<string, string | undefined>,
  context: LacunaActionContext,
): Promise<Record<string, unknown>> {
  return runProviderRequest({ label: "Lacuna", signal: context.signal }, async (signal) => {
    const url = new URL(path, lacunaBaseUrl);
    setSearchParams(url, query);

    for (let attempt = 0; ; attempt += 1) {
      const response = await context.fetcher(url, {
        headers: { accept: "application/json", "user-agent": providerUserAgent },
        signal,
      });
      if (retryableStatuses.has(response.status) && attempt < maxRetries) {
        await response.body?.cancel();
        await waitForRetry(context, response.headers.get("retry-after"), attempt, signal);
        continue;
      }

      const payload = await readProviderJsonBody(response, {
        emptyBody: null,
        invalidJsonMessage: "Lacuna returned invalid JSON.",
        // A gateway error page is not JSON; keep its real status instead of
        // reporting the parse failure as a 502.
        invalidJsonFallback: response.ok ? undefined : (text) => ({ detail: text.slice(0, 500) }),
        maxBytes: maxResponseBytes,
      });
      if (!response.ok) {
        throw new ProviderRequestError(
          response.status >= 500 ? 502 : response.status,
          readErrorMessage(payload) ?? `Lacuna request failed with HTTP ${response.status}.`,
          payload,
        );
      }
      const record = optionalRecord(payload);
      if (!record) throw providerResponseError("Lacuna returned an invalid response object.");
      return normalizeLacunaRecord(record);
    }
  });
}

function validateSearchOptions(searchType: string, rankingProfile: string, sort: string, fields?: string): void {
  if (rankingProfile === "semantic") {
    if (searchType !== "all" && searchType !== "paper") {
      throw providerInputError("semantic ranking supports only paper or all searches.");
    }
    if (fields) throw providerInputError("semantic ranking cannot be combined with fields.");
    if (sort !== "relevance") throw providerInputError("semantic ranking cannot be combined with year sorting.");
  }
  if (rankingProfile === "bm25_title_abstract" && (searchType === "author" || searchType === "institution")) {
    throw providerInputError("BM25 title/abstract ranking does not support author or institution searches.");
  }
  if (!fields) return;
  for (const weightedField of fields.split(",")) {
    const [field, rawWeight, ...extra] = weightedField.trim().split("^");
    const supportedTypes = field ? searchFieldTypes.get(field) : undefined;
    if (!field || extra.length > 0 || !supportedTypes) {
      throw providerInputError(`Unsupported Lacuna search field: ${weightedField.trim() || "empty field"}.`);
    }
    // The "all" search type spans every document type, so any field applies.
    if (searchType !== "all" && !supportedTypes.has(searchType)) {
      throw providerInputError(
        `Search field ${field} does not exist on ${searchType} results; it applies to: ${[...supportedTypes].sort().join(", ")}.`,
      );
    }
    if (rawWeight !== undefined) {
      const weight = Number(rawWeight);
      if (!Number.isFinite(weight) || weight <= 0 || weight > 100) {
        throw providerInputError(
          `Search field weight must be greater than 0 and at most 100: ${weightedField.trim()}.`,
        );
      }
    }
  }
}

function readPaperId(value: unknown): string {
  const input = requiredString(value, "paperIdOrUrl", providerInputError);
  const candidate = readRouteCandidate(input, "paperIdOrUrl");
  const match = candidate.match(/art_[A-Za-z0-9_-]+/);
  if (!match) throw providerInputError("paperIdOrUrl must contain a Lacuna art_ paper identifier.");
  return match[0];
}

function readDirectionId(value: unknown): number {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) return value;
  const input = requiredString(value, "directionIdOrUrl", providerInputError);
  const candidate = readRouteCandidate(input, "directionIdOrUrl");
  const match = candidate.match(directionRoutePattern) ?? candidate.match(trailingNumericSegmentPattern);
  const directionId = match ? Number(match[1]) : Number(candidate);
  if (!Number.isSafeInteger(directionId) || directionId <= 0) {
    throw providerInputError("directionIdOrUrl must contain a positive Lacuna direction identifier.");
  }
  return directionId;
}

function readHypothesisId(value: unknown): string {
  const input = requiredString(value, "hypothesisIdOrUrl", providerInputError);
  const candidate = readRouteCandidate(input, "hypothesisIdOrUrl");
  // Live hypothesis URLs fuse the id into the slug (`/hypothesis/{slug}-{id}`)
  // and may carry a trailing `/md` Markdown segment.
  const segment = candidate.match(hypothesisRoutePattern)?.[1] ?? candidate;
  const match = segment.match(hypothesisIdPattern);
  if (!match) throw providerInputError("hypothesisIdOrUrl must contain a 16-character Lacuna hypothesis ID.");
  return match[1].toLowerCase();
}

function readRouteId(value: unknown, fieldName: string, route: string): string {
  const input = requiredString(value, fieldName, providerInputError);
  const candidate = readRouteCandidate(input, fieldName);
  if (!candidate.includes("/")) return readRouteIdShape(candidate, fieldName, route);
  const parts = candidate.split("/").filter(Boolean);
  const routeIndex = parts.indexOf(route);
  if (routeIndex < 0 || routeIndex === parts.length - 1) {
    throw providerInputError(`${fieldName} must be a Lacuna ${route} ID or URL.`);
  }
  return readRouteIdShape(decodeRouteText(parts.at(-1) ?? "", fieldName), fieldName, route);
}

function readRouteIdShape(id: string, fieldName: string, route: string): string {
  // Dots survive encodeURIComponent, so an unchecked ".." would collapse the
  // request path instead of addressing a record.
  if (id === "." || id === ".." || !routeIdPattern.test(id)) {
    throw providerInputError(`${fieldName} must be a Lacuna ${route} ID or URL.`);
  }
  return id;
}

function readRouteCandidate(input: string, fieldName: string): string {
  if (!input.startsWith("/") && !/^[a-z][a-z\d+.-]*:/i.test(input)) return input;
  let url: URL;
  try {
    url = new URL(input, lacunaBaseUrl);
  } catch {
    throw providerInputError(`${fieldName} must be a valid Lacuna ID or URL.`);
  }
  if (url.origin !== lacunaOrigin) throw providerInputError(`${fieldName} must use ${lacunaBaseUrl}.`);
  return decodeRouteText(url.pathname, fieldName);
}

function decodeRouteText(value: string, fieldName: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    throw providerInputError(`${fieldName} must be a valid Lacuna ID or URL.`);
  }
}

function readAlias(value: unknown, fieldName: string, aliases: Record<string, string>, fallback: string): string {
  const raw = readOptionalText(value, fieldName)?.toLowerCase() ?? fallback;
  if (!Object.hasOwn(aliases, raw)) throw providerInputError(`${fieldName} has an unsupported value: ${raw}.`);
  return aliases[raw]!;
}

function readEnum<T extends string>(value: unknown, fieldName: string, allowed: readonly T[], fallback: T): T {
  const raw = readOptionalText(value, fieldName) ?? fallback;
  if (!allowed.includes(raw as T)) throw providerInputError(`${fieldName} has an unsupported value: ${raw}.`);
  return raw as T;
}

function readOptionalText(value: unknown, fieldName: string): string | undefined {
  if (value === undefined) return undefined;
  const text = optionalString(value);
  // Falling back to the default here would silently ignore a wrong-typed input.
  if (text === undefined) throw providerInputError(`${fieldName} must be a non-empty string.`);
  return text;
}

function readBoundedInteger(value: unknown, fieldName: string, min: number, max: number, fallback: number): number {
  return readOptionalBoundedInteger(value, fieldName, min, max) ?? fallback;
}

function readOptionalBoundedInteger(value: unknown, fieldName: string, min: number, max: number): number | undefined {
  if (value === undefined) return undefined;
  const number = optionalInteger(value);
  if (number === undefined || number < min || number > max) {
    throw providerInputError(
      max === Number.MAX_SAFE_INTEGER
        ? `${fieldName} must be an integer greater than or equal to ${min}.`
        : `${fieldName} must be an integer between ${min} and ${max}.`,
    );
  }
  return number;
}

function readPartialDate(value: unknown, fieldName: string): PartialDate | undefined {
  if (value === undefined) return undefined;
  const text = optionalString(value);
  const match = text?.match(partialDatePattern);
  if (!text || !match) {
    throw providerInputError(`${fieldName} must be a valid date in YYYY, YYYY-MM, or YYYY-MM-DD format.`);
  }

  const year = Number(match[1]);
  const month = match[2] ? Number(match[2]) : undefined;
  const day = match[3] ? Number(match[3]) : undefined;
  if (year < 1 || (month !== undefined && (month < 1 || month > 12))) {
    throw providerInputError(`${fieldName} must be a valid date in YYYY, YYYY-MM, or YYYY-MM-DD format.`);
  }

  const startMonth = month ?? 1;
  const endMonth = month ?? 12;
  const endOfMonth = readDaysInMonth(year, endMonth);
  if (day !== undefined && (day < 1 || day > endOfMonth)) {
    throw providerInputError(`${fieldName} must be a valid date in YYYY, YYYY-MM, or YYYY-MM-DD format.`);
  }
  return {
    value: text,
    earliestDay: year * 10_000 + startMonth * 100 + (day ?? 1),
    latestDay: year * 10_000 + endMonth * 100 + (day ?? endOfMonth),
  };
}

function readDaysInMonth(year: number, month: number): number {
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return daysInMonth[month - 1]!;
}

function validateDateRange(dateFrom?: PartialDate, dateTo?: PartialDate): void {
  if (dateFrom && dateTo && dateFrom.earliestDay > dateTo.latestDay) {
    throw providerInputError("dateFrom must not be after dateTo.");
  }
}

function normalizeLacunaRecord(record: Record<string, unknown>): Record<string, unknown> {
  const output: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) {
    // An own "__proto__" key would reach the Object.prototype setter and poison
    // the prototype of the record handed back to the caller.
    if (key === "_mcp_meta" || key === "__proto__") continue;
    output[key] = normalizeLacunaValue(value, key);
  }
  return output;
}

function normalizeLacunaValue(value: unknown, key: string): unknown {
  if (Array.isArray(value)) return value.map((item) => normalizeLacunaValue(item, key));
  const record = optionalRecord(value);
  if (record) return normalizeLacunaRecord(record);
  if (typeof value !== "string") return value;
  if (key === "url" || key.endsWith("_url")) {
    return absolutizeLacunaPath(value) ?? value;
  }
  if (
    ["article_markdown", "content", "description", "markdown", "profile_markdown", "summary_markdown"].includes(key)
  ) {
    return value.replace(markdownPathPattern, (matched) => {
      const path = matched.replace(markdownTrailingPunctuationPattern, "");
      return (absolutizeLacunaPath(path) ?? path) + matched.slice(path.length);
    });
  }
  return value;
}

/**
 * Resolve a Lacuna-relative path against the Lacuna site, or return undefined
 * when the value is not a same-origin relative path. Protocol-relative values
 * (`//host/x`) and backslash forms resolve off-origin, so the result is checked
 * rather than trusted.
 */
function absolutizeLacunaPath(value: string): string | undefined {
  if (!value.startsWith("/") || value.startsWith("//")) return undefined;
  let url: URL;
  try {
    url = new URL(value, lacunaBaseUrl);
  } catch {
    return undefined;
  }
  return url.origin === lacunaOrigin ? url.toString() : undefined;
}

function readErrorMessage(payload: unknown): string | undefined {
  const record = optionalRecord(payload);
  if (!record) return optionalString(payload);
  return optionalString(record.detail) ?? optionalString(record.message) ?? optionalString(record.error);
}

async function waitForRetry(
  context: LacunaActionContext,
  retryAfter: string | null,
  attempt: number,
  signal: AbortSignal,
): Promise<void> {
  const retryAfterMs = readRetryAfterMs(retryAfter);
  await (context.sleep ?? sleepBeforeRetry)(retryAfterMs ?? 500 * 2 ** attempt, signal);
}

/**
 * Wait out a Lacuna retry delay, rejecting as soon as the request is aborted.
 */
export function sleepBeforeRetry(delayMs: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return Promise.reject(readAbortReason(signal));
  return new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      signal?.removeEventListener("abort", abort);
      resolve();
    }, delayMs);
    const abort = (): void => {
      clearTimeout(timeout);
      signal?.removeEventListener("abort", abort);
      reject(readAbortReason(signal));
    };
    signal?.addEventListener("abort", abort, { once: true });
  });
}

/**
 * Skip the Lacuna retry delay. Tests and validators pass their own fetcher and
 * must not wait out real backoff.
 */
export function skipRetryDelay(_delayMs: number, signal?: AbortSignal): Promise<void> {
  return signal?.aborted ? Promise.reject(readAbortReason(signal)) : Promise.resolve();
}

function readAbortReason(signal?: AbortSignal): unknown {
  return signal?.reason ?? new DOMException("Aborted", "AbortError");
}

function readRetryAfterMs(value: string | null): number | undefined {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.min(seconds * 1000, 30_000);
  const date = Date.parse(value);
  return Number.isNaN(date) ? undefined : Math.min(Math.max(date - Date.now(), 0), 30_000);
}
