import type { TransitFileWriter } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";

import { optionalString, requiredString } from "../../core/cast.ts";
import { ProviderRequestError, providerUserAgent } from "../provider-runtime.ts";

interface ZLibraryCredential {
  email: string;
  password: string;
  eapiDomain?: string;
}

export type ZLibraryRuntimeContext = ZLibraryCredential & {
  fetcher: typeof fetch;
  signal?: AbortSignal;
  transitFiles?: TransitFileWriter;
};

type ZLibraryActionHandler = (input: Record<string, unknown>, context: ZLibraryRuntimeContext) => Promise<unknown>;

const defaultEapiDomains = ["z-library.ec", "z-library.sk", "1lib.sk"];

const eapiHeaders = {
  "user-agent": providerUserAgent,
  accept: "application/json, text/plain, */*",
  "content-type": "application/x-www-form-urlencoded",
};

interface ZLibrarySession {
  remixUserid: string;
  remixUserkey: string;
}

class ZLibraryAntiBotError extends ProviderRequestError {}

function normalizeEapiDomain(value: string, fieldName: string): string {
  let url: URL;
  try {
    url = new URL(value.includes("://") ? value : `https://${value}`);
  } catch {
    throw new ProviderRequestError(400, `${fieldName} must be a valid HTTPS domain`);
  }
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    (url.pathname !== "/" && url.pathname !== "") ||
    url.search ||
    url.hash
  ) {
    throw new ProviderRequestError(
      400,
      `${fieldName} must be an HTTPS domain without a path, query, fragment, or credentials`,
    );
  }
  return url.host;
}

function resolveEapiDomains(credential: ZLibraryCredential): string[] {
  const configuredDomains = [credential.eapiDomain?.trim(), ...defaultEapiDomains].filter((value): value is string =>
    Boolean(value),
  );
  return [...new Set(configuredDomains.map((value) => normalizeEapiDomain(value, "Z-Library EAPI domain")))];
}

function buildEapiUrl(domain: string, path: string): string {
  return `https://${domain}${path}`;
}

async function readJson(response: Response, domain: string): Promise<Record<string, unknown>> {
  const text = await response.text();
  let payload: unknown;
  try {
    payload = JSON.parse(text);
  } catch {
    throw new ZLibraryAntiBotError(
      response.status === 200 ? 502 : response.status,
      `zlibrary ${domain} returned non-JSON HTTP ${response.status} (possible anti-bot block page)`,
    );
  }
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
    throw new ProviderRequestError(response.status, `zlibrary ${domain} returned an unexpected JSON payload`);
  }
  return payload as Record<string, unknown>;
}

function assertSuccessfulPayload(
  payload: Record<string, unknown>,
  response: Response,
  path: string,
): Record<string, unknown> {
  if (payload.success !== 1) {
    throw new ProviderRequestError(
      response.status === 200 ? 502 : response.status,
      optionalString(payload.error) ?? optionalString(payload.message) ?? `zlibrary request to ${path} failed`,
      payload,
    );
  }
  return payload;
}

async function withEapiDomainFallback<T>(
  context: ZLibraryRuntimeContext,
  operation: (domain: string) => Promise<T>,
): Promise<T> {
  const domains = resolveEapiDomains(context);
  let antiBotError: ZLibraryAntiBotError | undefined;
  for (const domain of domains) {
    try {
      return await operation(domain);
    } catch (error) {
      if (!(error instanceof ZLibraryAntiBotError)) {
        throw error;
      }
      antiBotError = error;
    }
  }
  throw antiBotError ?? new ProviderRequestError(502, "zlibrary has no configured EAPI domain");
}

export async function zlibraryEapiLogin(context: ZLibraryRuntimeContext, domain: string): Promise<ZLibrarySession> {
  const body = new URLSearchParams({
    email: context.email,
    password: context.password,
  });
  const response = await context.fetcher(buildEapiUrl(domain, "/eapi/user/login"), {
    method: "POST",
    headers: eapiHeaders,
    body,
    signal: context.signal,
  });
  const payload = await readJson(response, domain);
  const user = (payload.user ?? {}) as Record<string, unknown>;
  const remixUserkey = optionalString(user.remix_userkey);
  if (payload.success !== 1 || !remixUserkey) {
    throw new ProviderRequestError(
      response.status === 200 ? 401 : response.status,
      optionalString(payload.error) ??
        optionalString(payload.message) ??
        "zlibrary login failed: check the email and password",
    );
  }
  return {
    remixUserid: String(user.id ?? ""),
    remixUserkey,
  };
}

async function eapiPost(
  context: ZLibraryRuntimeContext,
  domain: string,
  path: string,
  data: Record<string, string | string[]>,
): Promise<Record<string, unknown>> {
  const session = await zlibraryEapiLogin(context, domain);
  const body = new URLSearchParams();
  for (const [key, value] of Object.entries(data)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        body.append(key, item);
      }
    } else {
      body.append(key, value);
    }
  }
  const response = await context.fetcher(buildEapiUrl(domain, path), {
    method: "POST",
    headers: {
      ...eapiHeaders,
      cookie: `remix_userid=${session.remixUserid}; remix_userkey=${session.remixUserkey}`,
    },
    body,
    signal: context.signal,
  });
  return assertSuccessfulPayload(await readJson(response, domain), response, path);
}

async function eapiGet(
  context: ZLibraryRuntimeContext,
  domain: string,
  path: string,
  session?: ZLibrarySession,
): Promise<Record<string, unknown>> {
  const activeSession = session ?? (await zlibraryEapiLogin(context, domain));
  const response = await context.fetcher(buildEapiUrl(domain, path), {
    method: "GET",
    headers: {
      ...eapiHeaders,
      cookie: `remix_userid=${activeSession.remixUserid}; remix_userkey=${activeSession.remixUserkey}`,
    },
    signal: context.signal,
  });
  return assertSuccessfulPayload(await readJson(response, domain), response, path);
}

function normalizeBook(raw: Record<string, unknown>): Record<string, unknown> {
  const author = optionalString(raw.author) ?? "";
  return {
    id: String(raw.id ?? ""),
    title: optionalString(raw.title) ?? "",
    author,
    year: optionalString(raw.year) ?? "",
    language: optionalString(raw.language) ?? "",
    extension: optionalString(raw.extension) ?? "",
    size: optionalString(raw.filesize) ?? "",
    rating: optionalString(raw.rating) ?? "",
    quality: optionalString(raw.qualityScore) ?? "",
    hash: optionalString(raw.hash) ?? "",
    pages: optionalString(raw.pages) ?? "",
    isbn: optionalString(raw.isbn) ?? "",
    publisher: optionalString(raw.publisher) ?? "",
    url: optionalString(raw.href) ?? "",
    cover: optionalString(raw.cover) ?? "",
  };
}

function sanitizeDownloadFilename(filename: string): string {
  const candidate = filename.split("/").pop()?.split("\\").pop()?.trim() ?? "";
  if (!candidate || candidate === "." || candidate === "..") {
    return "";
  }
  return candidate;
}

async function downloadBookFile(
  context: ZLibraryRuntimeContext,
  domain: string,
  bookId: string,
  bookHash: string,
): Promise<Record<string, unknown>> {
  if (!context.transitFiles) {
    throw new ProviderRequestError(500, "zlibrary file output requires local transit files");
  }

  const session = await zlibraryEapiLogin(context, domain);
  const linkPayload = await eapiGet(context, domain, `/eapi/book/${bookId}/${bookHash}/file`, session);
  const filePayload = (linkPayload.file ?? linkPayload) as Record<string, unknown>;
  const downloadLink = optionalString(filePayload.downloadLink) ?? optionalString(filePayload.url) ?? "";

  if (!downloadLink) {
    throw new ProviderRequestError(502, `zlibrary returned no download link for book ${bookId}`);
  }
  const absoluteUrl = downloadLink.startsWith("/") ? buildEapiUrl(domain, downloadLink) : downloadLink;

  const response = await context.fetcher(absoluteUrl, {
    method: "GET",
    headers: {
      "user-agent": providerUserAgent,
      cookie: `remix_userid=${session.remixUserid}; remix_userkey=${session.remixUserkey}`,
    },
    signal: context.signal,
  });
  if (!response.ok) {
    throw new ProviderRequestError(response.status, `zlibrary download failed with HTTP ${response.status}`);
  }

  const contentType = response.headers.get("content-type") ?? "application/octet-stream";
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength === 0) {
    throw new ProviderRequestError(502, `zlibrary download produced an empty file for book ${bookId}`);
  }

  let name = "";
  const disposition = response.headers.get("content-disposition") ?? "";
  const extended = /filename\*\s*=\s*UTF-8''([^;\s]+)/iu.exec(disposition);
  const quoted = /filename\s*=\s*"([^"]*)"/iu.exec(disposition);
  const bare = /filename\s*=\s*([^;"\s]+)/iu.exec(disposition);
  if (extended) {
    name = decodeURIComponent(extended[1]);
  } else if (quoted) {
    name = quoted[1];
  } else if (bare) {
    name = bare[1];
  }
  name = sanitizeDownloadFilename(name) || `${bookId}.bin`;

  const upload = await context.transitFiles.create(new File([bytes], name, { type: contentType }));
  return {
    name,
    mimetype: contentType,
    downloadUrl: upload.downloadUrl,
  };
}

export const zlibraryActionHandlers: ProviderActionHandlers<"zlibrary", ZLibraryActionHandler> = {
  async search_books(input, context) {
    const data: Record<string, string | string[]> = {
      message: requiredString(input.message, "message", (message) => new ProviderRequestError(400, message)),
      limit: String(input.limit ?? 10),
      page: String(input.page ?? 1),
    };
    const yearFrom = input.yearFrom;
    if (typeof yearFrom === "number") data.yearFrom = String(yearFrom);
    const yearTo = input.yearTo;
    if (typeof yearTo === "number") data.yearTo = String(yearTo);
    if (Array.isArray(input.languages) && input.languages.length > 0) {
      data["languages[]"] = input.languages.map(String);
    }
    if (Array.isArray(input.extensions) && input.extensions.length > 0) {
      data["extensions[]"] = input.extensions.map(String);
    }
    if (input.exact === true) data.e = "1";
    const order = input.order;
    if (typeof order === "string") data.order = order;

    const payload = await withEapiDomainFallback(context, (domain) =>
      eapiPost(context, domain, "/eapi/book/search", data),
    );
    const books = Array.isArray(payload.books)
      ? payload.books.map((book) => normalizeBook(book as Record<string, unknown>))
      : [];
    const total =
      typeof payload.total === "number" ? payload.total : Array.isArray(payload.books) ? payload.books.length : 0;
    return { books, total };
  },

  async get_book_metadata(input, context) {
    const bookId = requiredString(input.id, "id", (message) => new ProviderRequestError(400, message));
    const bookHash = requiredString(input.hash, "hash", (message) => new ProviderRequestError(400, message));
    const payload = await withEapiDomainFallback(context, (domain) =>
      eapiGet(context, domain, `/eapi/book/${bookId}/${bookHash}`),
    );
    const raw = (payload.book ?? payload) as Record<string, unknown>;
    return { book: normalizeBook(raw) };
  },

  async download_book_to_file(input, context) {
    const bookId = requiredString(input.id, "id", (message) => new ProviderRequestError(400, message));
    const bookHash = requiredString(input.hash, "hash", (message) => new ProviderRequestError(400, message));
    const file = await withEapiDomainFallback(context, (domain) => downloadBookFile(context, domain, bookId, bookHash));
    return { file };
  },

  async get_download_limits(_input, context) {
    const payload = await withEapiDomainFallback(context, (domain) => eapiGet(context, domain, "/eapi/user/profile"));
    const user = (payload.user ?? {}) as Record<string, unknown>;
    const today = Number(user.downloads_today ?? user.dailyDownloadsCount ?? 0);
    const allowed = Number(user.downloads_limit ?? user.dailyDownloadLimit ?? 0);
    return {
      limits: {
        daily_amount: today,
        daily_allowed: allowed,
        daily_remaining: Math.max(0, allowed - today),
      },
    };
  },

  async get_recent_books(_input, context) {
    const payload = await withEapiDomainFallback(context, (domain) => eapiGet(context, domain, "/eapi/book/recently"));
    const books = Array.isArray(payload.books)
      ? payload.books.map((book) => normalizeBook(book as Record<string, unknown>))
      : [];
    return { books };
  },
};

export async function zlibraryEapiLoginWithFallback(
  context: ZLibraryRuntimeContext,
): Promise<ZLibrarySession & { domain: string }> {
  return withEapiDomainFallback(context, async (domain) => ({
    ...(await zlibraryEapiLogin(context, domain)),
    domain,
  }));
}
