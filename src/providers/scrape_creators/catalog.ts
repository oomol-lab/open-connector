import { createHash } from "node:crypto";
import { optionalRecord, optionalString } from "../../core/cast.ts";
import { createProviderTimeout } from "../provider-runtime.ts";
import { ScrapeCreatorsRequestError } from "./errors.ts";

const openApiUrl = "https://docs.scrapecreators.com/openapi.json";
const docsTimeoutMs = 15_000;
const catalogTtlMs = 60_000;
const staleTtlMs = 60 * 60_000;
const maxDocumentBytes = 12 * 1024 * 1024;

export interface ScrapeCreatorsEndpoint {
  method: "GET" | "POST";
  path: string;
  category: string;
  title: string;
  description: string;
  documentationUrl: string;
  requestSchema: Record<string, unknown>;
}

interface CatalogSnapshot {
  version: string;
  endpoints: ScrapeCreatorsEndpoint[];
  freshUntil: number;
  staleUntil: number;
}

interface LoadedScrapeCreatorsCatalog {
  snapshot: CatalogSnapshot;
  stale: boolean;
}

let snapshot: CatalogSnapshot | undefined;
let inFlight: Promise<{ snapshot: CatalogSnapshot; stale: boolean }> | undefined;

export async function loadScrapeCreatorsCatalog(fetcher: typeof fetch): Promise<LoadedScrapeCreatorsCatalog> {
  const now = Date.now();
  if (snapshot && now < snapshot.freshUntil) return { snapshot, stale: false };
  if (inFlight) return inFlight;

  inFlight = (async () => {
    try {
      const document = await fetchOpenApi(fetcher);
      const endpoints = parseOpenApi(document);
      if (endpoints.length === 0) {
        throw new ScrapeCreatorsRequestError("provider_error", "Scrape Creators OpenAPI has no endpoints", 502);
      }
      const fetchedAt = Date.now();
      snapshot = {
        version: createHash("sha256").update(document).digest("hex"),
        endpoints,
        freshUntil: fetchedAt + catalogTtlMs,
        staleUntil: fetchedAt + staleTtlMs,
      };
      return { snapshot, stale: false };
    } catch (error) {
      if (snapshot && Date.now() < snapshot.staleUntil) return { snapshot, stale: true };
      if (error instanceof ScrapeCreatorsRequestError) throw error;
      throw new ScrapeCreatorsRequestError("provider_error", "Scrape Creators OpenAPI request failed", 502);
    } finally {
      inFlight = undefined;
    }
  })();
  return inFlight;
}

function parseOpenApi(document: string) {
  let payload: unknown;
  try {
    payload = JSON.parse(document);
  } catch {
    throw new ScrapeCreatorsRequestError("provider_error", "Scrape Creators OpenAPI is invalid JSON", 502);
  }
  const paths = optionalRecord(optionalRecord(payload)?.paths);
  if (!paths) return [];

  const endpoints: ScrapeCreatorsEndpoint[] = [];
  for (const [path, pathItemValue] of Object.entries(paths)) {
    const pathItem = optionalRecord(pathItemValue);
    if (!pathItem || !isAllowedPath(path)) continue;
    for (const method of ["GET", "POST"] as const) {
      const operation = optionalRecord(pathItem[method.toLowerCase()]);
      if (!operation) continue;
      const tags = Array.isArray(operation.tags) ? operation.tags : [];
      const category = tags.find((tag): tag is string => typeof tag === "string") ?? "Other";
      endpoints.push({
        method,
        path,
        category,
        title: optionalString(operation.summary) ?? `${method} ${path}`,
        description: optionalString(operation.description) ?? "",
        documentationUrl: `https://docs.scrapecreators.com${path}`,
        requestSchema: buildRequestSchema(operation),
      });
    }
  }
  return endpoints.sort((a, b) => a.path.localeCompare(b.path) || a.method.localeCompare(b.method));
}

function buildRequestSchema(operation: Record<string, unknown>) {
  const query: Record<string, unknown> = {};
  for (const value of Array.isArray(operation.parameters) ? operation.parameters : []) {
    const parameter = optionalRecord(value);
    const name = optionalString(parameter?.name);
    if (!parameter || parameter.in !== "query" || !name) continue;
    query[name] = {
      required: parameter.required === true,
      description: optionalString(parameter.description) ?? "",
      schema: optionalRecord(parameter.schema) ?? {},
    };
  }
  const content = optionalRecord(optionalRecord(optionalRecord(operation.requestBody)?.content)?.["application/json"]);
  return {
    query,
    body: optionalRecord(content?.schema),
  };
}

function isAllowedPath(path: string) {
  return (
    path.startsWith("/") &&
    !path.startsWith("//") &&
    !path.includes("://") &&
    !path.includes("?") &&
    !path.includes("#") &&
    !path.includes("\\")
  );
}

async function fetchOpenApi(fetcher: typeof fetch) {
  const timeout = createProviderTimeout(undefined, docsTimeoutMs);
  try {
    const response = await fetcher(openApiUrl, {
      headers: { accept: "application/json" },
      redirect: "error",
      signal: timeout.signal,
    });
    if (!response.ok)
      throw new ScrapeCreatorsRequestError(
        "provider_error",
        `Scrape Creators OpenAPI returned HTTP ${response.status}`,
        502,
      );
    const contentLength = Number(response.headers.get("content-length"));
    if (Number.isFinite(contentLength) && contentLength > maxDocumentBytes)
      throw new ScrapeCreatorsRequestError("provider_error", "Scrape Creators OpenAPI is too large", 502);
    return readBoundedResponseText(response, maxDocumentBytes, "Scrape Creators OpenAPI");
  } finally {
    timeout.cleanup();
  }
}

export async function readBoundedResponseText(response: Response, maxBytes: number, label: string): Promise<string> {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let byteLength = 0;
  try {
    while (true) {
      const result = await reader.read();
      if (result.done) break;
      byteLength += result.value.byteLength;
      if (byteLength > maxBytes) {
        await reader.cancel();
        throw new ScrapeCreatorsRequestError("provider_error", `${label} is too large`, 502);
      }
      chunks.push(result.value);
    }
  } finally {
    reader.releaseLock();
  }
  const content = new Uint8Array(byteLength);
  let offset = 0;
  for (const chunk of chunks) {
    content.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(content);
}
