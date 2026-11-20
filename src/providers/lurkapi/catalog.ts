import { looseArray, optionalNumber, optionalRecord, optionalString } from "../../core/cast.ts";
import {
  providerResponseError,
  providerUserAgent,
  readProviderJsonBody,
  runProviderRequest,
} from "../provider-runtime.ts";

export const lurkapiBaseUrl = "https://api.lurkapi.com";

/** LurkAPI's OpenAPI document is public and lists every endpoint, so new ones need no provider change. */
const openApiPath = "/openapi.json";
const catalogTtlMs = 10 * 60_000;
const openApiMaxBytes = 4 * 1024 * 1024;

export interface LurkapiParameter {
  name: string;
  required: boolean;
  type: string;
  description: string;
  enum: unknown[] | null;
}

export interface LurkapiEndpoint {
  path: string;
  platform: string;
  title: string;
  description: string;
  credits: number | null;
  documentationUrl: string | null;
  parameters: LurkapiParameter[];
}

interface CatalogSnapshot {
  endpoints: LurkapiEndpoint[];
  fetchedAt: number;
}

interface LoadCatalogOptions {
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

let snapshot: CatalogSnapshot | undefined;

/**
 * Read LurkAPI's endpoints from its OpenAPI document, kept for ten minutes.
 * A failed refresh keeps serving the last good copy.
 */
export async function loadLurkapiEndpoints(options: LoadCatalogOptions): Promise<LurkapiEndpoint[]> {
  if (snapshot && Date.now() - snapshot.fetchedAt < catalogTtlMs) {
    return snapshot.endpoints;
  }
  try {
    const endpoints = parseOpenApi(await fetchOpenApi(options));
    if (endpoints.length === 0) {
      throw providerResponseError("LurkAPI OpenAPI document lists no endpoints");
    }
    snapshot = { endpoints, fetchedAt: Date.now() };
    return endpoints;
  } catch (error) {
    if (snapshot) return snapshot.endpoints;
    throw error;
  }
}

async function fetchOpenApi({ fetcher, signal }: LoadCatalogOptions): Promise<unknown> {
  return runProviderRequest({ label: "LurkAPI OpenAPI", signal }, async (requestSignal) => {
    const response = await fetcher(new URL(openApiPath, lurkapiBaseUrl).toString(), {
      headers: { "accept": "application/json", "user-agent": providerUserAgent },
      signal: requestSignal,
    });
    if (!response.ok) {
      throw providerResponseError(`LurkAPI OpenAPI document returned HTTP ${response.status}`);
    }
    return readProviderJsonBody(response, {
      emptyBody: {},
      invalidJsonMessage: "LurkAPI OpenAPI document is invalid JSON",
      maxBytes: openApiMaxBytes,
    });
  });
}

function parseOpenApi(document: unknown): LurkapiEndpoint[] {
  const paths = optionalRecord(optionalRecord(document)?.paths) ?? {};
  const endpoints: LurkapiEndpoint[] = [];
  for (const [path, item] of Object.entries(paths)) {
    // Every LurkAPI endpoint is a GET with its parameters in the query string.
    const operation = optionalRecord(optionalRecord(item)?.get);
    if (!operation || !path.startsWith("/v") || path.includes("{")) continue;
    endpoints.push({
      path,
      platform: optionalString(looseArray(operation.tags)[0]) ?? "Other",
      title: optionalString(operation.summary) ?? path,
      description: optionalString(operation.description) ?? "",
      credits: optionalNumber(operation["x-credits"]) ?? null,
      documentationUrl: optionalString(optionalRecord(operation.externalDocs)?.url) ?? null,
      parameters: looseArray(operation.parameters).flatMap((value) => {
        const parameter = optionalRecord(value);
        const name = optionalString(parameter?.name);
        if (!parameter || !name || parameter.in !== "query") return [];
        const schema = optionalRecord(parameter.schema) ?? {};
        return [
          {
            name,
            required: parameter.required === true,
            type: optionalString(schema.type) ?? "string",
            description: optionalString(parameter.description) ?? "",
            enum: Array.isArray(schema.enum) ? schema.enum : null,
          },
        ];
      }),
    });
  }
  return endpoints;
}
