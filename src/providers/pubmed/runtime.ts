import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderRuntimeHandler } from "../provider-runtime.ts";
import type { PubmedActionName } from "./actions.ts";
import type { PubmedArticle } from "./runtime-xml.ts";

import { createHash } from "node:crypto";
import {
  objectArray,
  optionalInteger,
  optionalObjectArray,
  optionalRecord,
  optionalString,
  requiredRecord,
  requiredString,
  requiredStringArray,
} from "../../core/cast.ts";
import { readBoundedResponseBytes } from "../../core/request.ts";
import { createProviderTimeout, providerFetch, providerUserAgent, ProviderRequestError } from "../provider-runtime.ts";
import { parsePubmedArticleSet } from "./runtime-xml.ts";

type PubmedSort = "first_author" | "journal" | "publication_date" | "relevance";
type PubmedIdType = "doi" | "mid" | "pmcid" | "pmid";

interface PubmedActionContext {
  apiKey?: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
  requestGate: Pick<PubmedRequestGate, "wait">;
  sleep(delayMs: number, signal?: AbortSignal): Promise<void>;
}

interface PubmedLinkedArticlesResult {
  sourcePmid: string;
  articles: PubmedArticle[];
}

interface NcbiTextRequestOptions {
  source: string;
  maxBytes: number;
  intervalMs: number;
  init: RequestInit;
}

interface PendingPubmedRequest {
  intervalMs: number;
  signal?: AbortSignal;
  resolve(): void;
  reject(error: unknown): void;
  abort(): void;
}

interface CachedPubmedRequestGate {
  leases: number;
  requestGate: PubmedRequestGate;
}

/** Serializes E-utility calls and reserves the next provider request slot. */
export class PubmedRequestGate {
  private readonly now: () => number;
  private readonly sleep: (delayMs: number, signal?: AbortSignal) => Promise<void>;
  private nextRequestAt = 0;
  private readonly queue: PendingPubmedRequest[] = [];
  private processing = false;

  constructor(now: () => number = Date.now, sleep: (delayMs: number, signal?: AbortSignal) => Promise<void> = delay) {
    this.now = now;
    this.sleep = sleep;
  }

  wait(intervalMs: number, signal?: AbortSignal): Promise<void> {
    if (signal?.aborted) {
      return Promise.reject(createAbortError());
    }

    return new Promise((resolve, reject) => {
      const request: PendingPubmedRequest = {
        intervalMs,
        signal,
        resolve,
        reject,
        abort: () => {
          const index = this.queue.indexOf(request);
          if (index < 0) {
            return;
          }
          this.queue.splice(index, 1);
          signal?.removeEventListener("abort", request.abort);
          reject(createAbortError());
        },
      };
      signal?.addEventListener("abort", request.abort, { once: true });
      this.queue.push(request);
      void this.processQueue();
    });
  }

  isIdle(): boolean {
    return !this.processing && this.queue.length === 0 && this.nextRequestAt <= this.now();
  }

  private async processQueue(): Promise<void> {
    if (this.processing) {
      return;
    }
    this.processing = true;
    try {
      let request: PendingPubmedRequest | undefined;
      while ((request = this.queue.shift())) {
        request.signal?.removeEventListener("abort", request.abort);
        try {
          throwIfAborted(request.signal);
          const waitMs = Math.max(0, this.nextRequestAt - this.now());
          if (waitMs > 0) {
            await this.sleep(waitMs, request.signal);
          }
          throwIfAborted(request.signal);
          this.nextRequestAt = this.now() + request.intervalMs;
          request.resolve();
        } catch (error) {
          request.reject(error);
        }
      }
    } finally {
      this.processing = false;
    }
  }
}

/** Keep per-key NCBI quota gates without retaining raw credentials or growing without bound. */
export class PubmedRequestGatePool {
  private readonly maximumEntries: number;
  private readonly requestGates = new Map<string, CachedPubmedRequestGate>();
  private readonly overflowEntry: CachedPubmedRequestGate = {
    leases: 0,
    requestGate: new PubmedRequestGate(),
  };

  constructor(maximumEntries: number) {
    if (!Number.isInteger(maximumEntries) || maximumEntries < 1) {
      throw new RangeError("maximumEntries must be a positive integer");
    }
    this.maximumEntries = maximumEntries;
  }

  forKey(apiKey: string): Pick<PubmedRequestGate, "wait"> {
    return {
      wait: (intervalMs, signal) => this.wait(apiKey, intervalMs, signal),
    };
  }

  private async wait(apiKey: string, intervalMs: number, signal?: AbortSignal): Promise<void> {
    const identity = createHash("sha256").update(apiKey).digest("hex");
    const existing = this.requestGates.get(identity);
    let entry: CachedPubmedRequestGate;
    if (existing) {
      this.requestGates.delete(identity);
      this.requestGates.set(identity, existing);
      entry = existing;
    } else {
      if (this.requestGates.size >= this.maximumEntries && !this.isEvictable(this.overflowEntry)) {
        entry = this.overflowEntry;
      } else {
        if (this.requestGates.size >= this.maximumEntries) {
          for (const [cachedIdentity, cachedEntry] of this.requestGates) {
            if (this.isEvictable(cachedEntry)) {
              this.requestGates.delete(cachedIdentity);
              break;
            }
          }
        }
        entry =
          this.requestGates.size >= this.maximumEntries
            ? this.overflowEntry
            : { leases: 0, requestGate: new PubmedRequestGate() };
        if (entry !== this.overflowEntry) {
          this.requestGates.set(identity, entry);
        }
      }
    }

    entry.leases += 1;
    try {
      await entry.requestGate.wait(intervalMs, signal);
    } finally {
      entry.leases -= 1;
    }
  }

  private isEvictable(entry: CachedPubmedRequestGate): boolean {
    return entry.leases === 0 && entry.requestGate.isIdle();
  }
}

const pubmedApiBaseUrl = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/";
const citationMatcherUrl = "https://pubmed.ncbi.nlm.nih.gov/api/citmatch/";
const idConverterUrl = "https://pmc.ncbi.nlm.nih.gov/tools/idconv/api/v1/articles/";
const pubmedToolName = "openconnector";
const pubmedSortValues: Record<PubmedSort, string> = {
  first_author: "Author",
  journal: "JournalName",
  publication_date: "pub date",
  relevance: "relevance",
};
const anonymousRequestIntervalMs = 334;
const apiKeyRequestIntervalMs = 100;
const pubmedRequestTimeoutMs = 30_000;
const maximumJsonResponseBytes = 1024 * 1024;
const maximumXmlResponseBytes = 10 * 1024 * 1024;
const maximumCachedApiKeyRequestGates = 100;
const anonymousRequestGate = new PubmedRequestGate();
const apiKeyRequestGates = new PubmedRequestGatePool(maximumCachedApiKeyRequestGates);

function delay(delayMs: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) {
    return Promise.reject(createAbortError());
  }
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      signal?.removeEventListener("abort", abort);
      resolve();
    }, delayMs);
    const abort = (): void => {
      clearTimeout(timeoutId);
      signal?.removeEventListener("abort", abort);
      reject(createAbortError());
    };
    signal?.addEventListener("abort", abort, { once: true });
  });
}

function immediateDelay(_delayMs: number, signal?: AbortSignal): Promise<void> {
  throwIfAborted(signal);
  return Promise.resolve();
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw createAbortError();
  }
}

function createAbortError(): Error {
  const error = new Error("The PubMed request was aborted");
  error.name = "AbortError";
  return error;
}

export const pubmedActionHandlers: Record<PubmedActionName, ProviderRuntimeHandler<PubmedActionContext>> = {
  async search_articles(input, context) {
    const query = requiredString(input.query, "query", invalidInput);
    const offset = optionalInteger(input.offset) ?? 0;
    const limit = optionalInteger(input.limit) ?? 10;
    if (offset + limit > 10_000) {
      throw invalidInput("offset plus limit must not exceed 10000 for PubMed searches");
    }
    const sort = readSort(input.sort);
    const publicationDateRange = readPublicationDateRange(input.publicationDateRange);
    const searchPayload = requiredRecord(
      await requestPubmedJson(
        "esearch.fcgi",
        {
          term: query,
          retstart: String(offset),
          retmax: String(limit),
          sort: sort ? pubmedSortValues[sort] : undefined,
          datetype: publicationDateRange ? "pdat" : undefined,
          mindate: formatNcbiDate(publicationDateRange?.from),
          maxdate: formatNcbiDate(publicationDateRange?.to),
        },
        context,
      ),
      "PubMed search response",
      invalidResponse,
    );
    const result = requiredRecord(searchPayload.esearchresult, "PubMed esearchresult", invalidResponse);
    const pmids = requiredStringArray(result.idlist, "PubMed search idlist", invalidResponse);

    return {
      total: readIntegerString(result.count, "PubMed search count"),
      offset,
      limit,
      queryTranslation: optionalString(result.querytranslation) ?? null,
      articles: pmids.length > 0 ? await fetchArticles(pmids, context) : [],
    };
  },
  async get_article(input, context) {
    const pmid = readPmid(input.pmid, "pmid");
    const articles = await fetchArticles([pmid], context);
    return {
      found: articles.length > 0,
      article: articles[0] ?? null,
    };
  },
  async get_articles(input, context) {
    const pmids = readPmidArray(input.pmids);
    const articles = await fetchArticles(pmids, context);
    const returnedPmids = new Set(articles.map((article) => article.pmid));
    return {
      articles,
      notFoundPmids: pmids.filter((pmid) => !returnedPmids.has(pmid)),
    };
  },
  async find_related_articles(input, context) {
    const sourcePmid = readPmid(input.pmid, "pmid");
    const limit = readLimit(input.limit);

    const payload = requiredRecord(
      await requestPubmedJson(
        "elink.fcgi",
        {
          dbfrom: "pubmed",
          id: sourcePmid,
          linkname: "pubmed_pubmed",
          cmd: "neighbor",
        },
        context,
      ),
      "PubMed related articles response",
      invalidResponse,
    );
    const relatedPmids = readLinkedPmids(payload, "pubmed_pubmed", "PubMed related article links")
      .filter((pmid) => pmid !== sourcePmid)
      .slice(0, limit);
    return {
      sourcePmid,
      articles: relatedPmids.length > 0 ? await fetchArticles(relatedPmids, context) : [],
    };
  },
  async match_citation(input, context) {
    const citation = requiredString(input.citation, "citation", invalidInput);
    const url = new URL(citationMatcherUrl);
    url.searchParams.set("method", "heuristic");
    url.searchParams.set("raw-text", citation);
    const payload = requiredRecord(
      await requestNcbiJson(url, "PubMed Citation Matcher", context),
      "PubMed Citation Matcher response",
      invalidResponse,
    );
    if (payload.success !== true) {
      throw new ProviderRequestError(502, "PubMed Citation Matcher reported an unsuccessful response");
    }
    const result = requiredRecord(payload.result, "PubMed Citation Matcher result", invalidResponse);
    const pmids = readCitationPmids(result.uids);
    return {
      matched: pmids.length > 0,
      articles: pmids.length > 0 ? await fetchArticles(pmids, context) : [],
    };
  },
  async get_citing_articles(input, context) {
    return fetchLinkedArticles(readPmid(input.pmid, "pmid"), "pubmed_pubmed_citedin", readLimit(input.limit), context);
  },
  async get_article_references(input, context) {
    return fetchLinkedArticles(readPmid(input.pmid, "pmid"), "pubmed_pubmed_refs", readLimit(input.limit), context);
  },
  async convert_article_ids(input, context) {
    const ids = readArticleIds(input.ids);
    const idType = readIdType(input.idType);
    const url = new URL(idConverterUrl);
    url.searchParams.set("ids", ids.join(","));
    url.searchParams.set("idtype", idType);
    url.searchParams.set("format", "json");
    url.searchParams.set("tool", pubmedToolName);
    const payload = requiredRecord(
      await requestNcbiJson(url, "PMC ID Converter", context),
      "PMC ID Converter response",
      invalidResponse,
    );
    const records = objectArray(payload.records, "PMC ID Converter records", invalidResponse);
    return {
      records: records.map((record, index) => ({
        requestedId: readIdentifier(record["requested-id"], `PMC ID Converter records[${index}].requested-id`),
        pmid: optionalIdentifier(record.pmid),
        pmcid: optionalString(record.pmcid) ?? null,
        doi: optionalString(record.doi) ?? null,
        mid: optionalString(record.mid) ?? null,
        error: optionalString(record.errmsg) ?? null,
      })),
    };
  },
};

export async function validatePubmedCredential(
  input: { apiKey: string },
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const context = createPubmedActionContext({
    apiKey: input.apiKey,
    fetcher,
    signal,
  });
  const payload = requiredRecord(
    await requestPubmedJson("einfo.fcgi", {}, context),
    "PubMed credential validation response",
    invalidResponse,
  );
  const result = requiredRecord(payload.einforesult, "PubMed einforesult", invalidResponse);
  const database = optionalObjectArray(result.dbinfo, "PubMed EInfo database", invalidResponse).find(
    (entry) => optionalString(entry.dbname) === "pubmed",
  );
  if (!database) {
    throw new ProviderRequestError(400, "NCBI API key could not access PubMed");
  }

  return {};
}

interface CreatePubmedActionContextOptions {
  apiKey?: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

export function createPubmedActionContext(options: CreatePubmedActionContextOptions): PubmedActionContext {
  return {
    ...options,
    // The real NCBI request gate and Retry-After backoff apply to the shared
    // production fetcher; test stubs pass a different fetcher and skip throttling.
    requestGate: options.fetcher === providerFetch ? requestGateFor(options.apiKey) : { wait: immediateDelay },
    sleep: options.fetcher === providerFetch ? delay : immediateDelay,
  };
}

function requestGateFor(apiKey: string | undefined): Pick<PubmedRequestGate, "wait"> {
  if (!apiKey) {
    return anonymousRequestGate;
  }

  return apiKeyRequestGates.forKey(apiKey);
}

function invalidInput(message: string): ProviderRequestError {
  return new ProviderRequestError(400, message);
}

function invalidResponse(message: string): ProviderRequestError {
  return new ProviderRequestError(502, message);
}

function readSort(value: unknown): PubmedSort | undefined {
  const sort = optionalString(value);
  if (!sort) {
    return undefined;
  }
  if (sort in pubmedSortValues) {
    return sort as PubmedSort;
  }
  throw invalidInput("sort is not supported by PubMed");
}

function readPmid(value: unknown, fieldName: string): string {
  const pmid = requiredString(value, fieldName, invalidInput);
  if (!/^\d+$/u.test(pmid)) {
    throw invalidInput(`${fieldName} must contain only digits`);
  }
  return pmid;
}

function readPmidArray(value: unknown): string[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > 50) {
    throw invalidInput("pmids must contain between 1 and 50 PubMed IDs");
  }
  return value.map((pmid, index) => readPmid(pmid, `pmids[${index}]`));
}

function readLimit(value: unknown): number {
  const limit = optionalInteger(value) ?? 10;
  if (limit < 1 || limit > 50) {
    throw invalidInput("limit must be between 1 and 50");
  }
  return limit;
}

function readArticleIds(value: unknown): string[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > 200) {
    throw invalidInput("ids must contain between 1 and 200 article identifiers");
  }
  return value.map((id, index) => requiredString(id, `ids[${index}]`, invalidInput));
}

function readIdType(value: unknown): PubmedIdType {
  const idType = requiredString(value, "idType", invalidInput);
  if (idType === "doi" || idType === "mid" || idType === "pmcid" || idType === "pmid") {
    return idType;
  }
  throw invalidInput("idType must be doi, mid, pmcid, or pmid");
}

interface PublicationDateRange {
  from: string;
  to: string;
}

function readPublicationDateRange(value: unknown): PublicationDateRange | undefined {
  const range = optionalRecord(value);
  if (!range) {
    return undefined;
  }
  const from = requiredString(range.from, "publicationDateRange.from", invalidInput);
  const to = requiredString(range.to, "publicationDateRange.to", invalidInput);
  if (from > to) {
    throw invalidInput("publicationDateRange.from must not be after publicationDateRange.to");
  }
  return { from, to };
}

function formatNcbiDate(value: string | undefined): string | undefined {
  return value?.replaceAll("-", "/");
}

async function fetchArticles(pmids: string[], context: PubmedActionContext): Promise<PubmedArticle[]> {
  const xml = await requestPubmedText(
    "efetch.fcgi",
    {
      id: pmids.join(","),
      retmode: "xml",
    },
    context,
    maximumXmlResponseBytes,
    "application/xml, text/xml",
  );
  return parsePubmedArticleSet(xml);
}

async function fetchLinkedArticles(
  sourcePmid: string,
  linkName: "pubmed_pubmed_citedin" | "pubmed_pubmed_refs",
  limit: number,
  context: PubmedActionContext,
): Promise<PubmedLinkedArticlesResult> {
  const payload = requiredRecord(
    await requestPubmedJson(
      "elink.fcgi",
      {
        dbfrom: "pubmed",
        id: sourcePmid,
        linkname: linkName,
        cmd: "neighbor",
      },
      context,
    ),
    `PubMed ${linkName} response`,
    invalidResponse,
  );
  const pmids = readLinkedPmids(payload, linkName, `PubMed ${linkName} links`).slice(0, limit);
  return {
    sourcePmid,
    articles: pmids.length > 0 ? await fetchArticles(pmids, context) : [],
  };
}

async function requestNcbiJson(url: URL, source: string, context: PubmedActionContext): Promise<unknown> {
  const headers = new Headers({
    accept: "application/json",
    "user-agent": providerUserAgent,
  });
  const text = await requestNcbiText(
    url,
    {
      source,
      maxBytes: maximumJsonResponseBytes,
      intervalMs: anonymousRequestIntervalMs,
      init: { headers },
    },
    context,
  );
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, `${source} returned malformed JSON`);
  }
}

async function requestPubmedJson(
  utility: string,
  query: Record<string, string | undefined>,
  context: PubmedActionContext,
): Promise<unknown> {
  const text = await requestPubmedText(
    utility,
    { ...query, retmode: "json" },
    context,
    maximumJsonResponseBytes,
    "application/json",
  );
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, `PubMed returned malformed JSON from ${utility}`);
  }
}

async function requestPubmedText(
  utility: string,
  query: Record<string, string | undefined>,
  context: PubmedActionContext,
  maxBytes: number,
  accept: string,
): Promise<string> {
  const url = new URL(utility, pubmedApiBaseUrl);
  url.searchParams.set("db", "pubmed");
  url.searchParams.set("tool", pubmedToolName);
  for (const [name, value] of Object.entries(query)) {
    if (value !== undefined) {
      url.searchParams.set(name, value);
    }
  }
  if (context.apiKey) {
    url.searchParams.set("api_key", context.apiKey);
  }
  const usePost = utility === "esearch.fcgi" && (query.term?.length ?? 0) > 500;
  const body = usePost ? new URLSearchParams(url.searchParams) : undefined;
  if (usePost) {
    url.search = "";
  }
  const headers = new Headers({
    accept,
    "user-agent": providerUserAgent,
  });
  if (usePost) {
    headers.set("content-type", "application/x-www-form-urlencoded");
  }

  return requestNcbiText(
    url,
    {
      source: "PubMed",
      maxBytes,
      intervalMs: context.apiKey ? apiKeyRequestIntervalMs : anonymousRequestIntervalMs,
      init: {
        headers,
        method: usePost ? "POST" : "GET",
        body,
      },
    },
    context,
  );
}

async function requestNcbiText(
  url: URL,
  options: NcbiTextRequestOptions,
  context: PubmedActionContext,
): Promise<string> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await context.requestGate.wait(options.intervalMs, context.signal);
    const { response, text } = await requestNcbiTextOnce(url, options, context);
    if (response.ok) {
      return text;
    }
    if (attempt < 2 && isRetryableStatus(response.status)) {
      await context.sleep(readRetryDelay(response, attempt), context.signal);
      continue;
    }
    throw new ProviderRequestError(
      response.status,
      extractPubmedError(text) ?? `${options.source} request failed with HTTP ${response.status}`,
    );
  }

  throw new ProviderRequestError(502, `${options.source} request failed after retries`);
}

async function requestNcbiTextOnce(
  url: URL,
  options: NcbiTextRequestOptions,
  context: PubmedActionContext,
): Promise<{ response: Response; text: string }> {
  const timeout = createProviderTimeout(context.signal, pubmedRequestTimeoutMs);
  try {
    const response = await context.fetcher(url, {
      ...options.init,
      signal: timeout.signal,
    });
    const bytes = await readBoundedResponseBytes(response, {
      maxBytes: options.maxBytes,
      fieldName: `${options.source} response`,
      createError: (message) => new ProviderRequestError(502, message),
    });
    return {
      response,
      text: new TextDecoder().decode(bytes),
    };
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    if (context.signal?.aborted) {
      throw error;
    }
    if (timeout.didTimeout()) {
      throw new ProviderRequestError(504, `${options.source} request timed out`);
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error
        ? `${options.source} request failed: ${error.message}`
        : `${options.source} request failed`,
    );
  } finally {
    timeout.cleanup();
  }
}

function isRetryableStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

function readRetryDelay(response: Response, attempt: number): number {
  const retryAfter = response.headers.get("retry-after");
  if (retryAfter) {
    if (/^\d+$/u.test(retryAfter)) {
      return Math.min(Number(retryAfter) * 1_000, 30_000);
    }
    const retryAt = Date.parse(retryAfter);
    if (Number.isFinite(retryAt)) {
      return Math.min(Math.max(0, retryAt - Date.now()), 30_000);
    }
  }
  return 250 * 2 ** attempt;
}

function extractPubmedError(text: string): string | undefined {
  const trimmed = text.trim();
  if (!trimmed) {
    return undefined;
  }
  try {
    const payload = optionalRecord(JSON.parse(trimmed));
    const direct = optionalString(payload?.error);
    if (direct) {
      return direct;
    }
    const errors = payload?.errors;
    if (Array.isArray(errors)) {
      return errors.filter((item): item is string => typeof item === "string").join("; ") || undefined;
    }
  } catch {
    return trimmed.slice(0, 500);
  }
  return trimmed.slice(0, 500);
}

function readLinkedPmids(payload: Record<string, unknown>, linkName: string, fieldName: string): string[] {
  const linksets = optionalObjectArray(payload.linksets, `${fieldName} linkset`, invalidResponse);
  for (const linkset of linksets) {
    const related = optionalObjectArray(linkset.linksetdbs, `${fieldName} database`, invalidResponse).find(
      (linksetDatabase) => optionalString(linksetDatabase.linkname) === linkName,
    );
    if (related) {
      return requiredStringArray(related.links, fieldName, invalidResponse);
    }
  }
  return [];
}

function readCitationPmids(value: unknown): string[] {
  return objectArray(value, "PubMed Citation Matcher UIDs", invalidResponse).map((record, index) =>
    readPmid(record.pubmed, `PubMed Citation Matcher UIDs[${index}].pubmed`),
  );
}

function readIdentifier(value: unknown, fieldName: string): string {
  const identifier = optionalIdentifier(value);
  if (!identifier) {
    throw new ProviderRequestError(502, `${fieldName} is malformed`);
  }
  return identifier;
}

function optionalIdentifier(value: unknown): string | null {
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) {
    return String(value);
  }
  return optionalString(value) ?? null;
}

function readIntegerString(value: unknown, fieldName: string): number {
  const text = optionalString(value);
  const parsed = text ? Number(text) : Number.NaN;
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new ProviderRequestError(502, `${fieldName} is malformed`);
  }
  return parsed;
}
