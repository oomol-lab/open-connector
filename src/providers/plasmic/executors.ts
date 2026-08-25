import type { ExecutionContext, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ProviderFetch } from "../provider-runtime.ts";

import { optionalBoolean, optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import {
  createProviderTimeout,
  defineProviderExecutors,
  defineProviderProxy,
  providerUserAgent,
  ProviderRequestError,
  requireApiKeyCredential,
} from "../provider-runtime.ts";

const service = "plasmic";
const plasmicDataBaseUrl = "https://data.plasmic.app";
const plasmicCmsBaseUrl = `${plasmicDataBaseUrl}/api/v1/cms`;
const plasmicDefaultRequestTimeoutMs = 30_000;
const plasmicCmsTokenHeaderName = "x-plasmic-api-cms-tokens";

interface PlasmicContext {
  apiKey: string;
  cmsId: string;
  fetcher: ProviderFetch;
  signal?: AbortSignal;
}

type PlasmicActionHandler = (input: Record<string, unknown>, context: PlasmicContext) => Promise<unknown>;

const plasmicActionHandlers: ProviderActionHandlers<"plasmic", PlasmicActionHandler> = {
  list_items(input, context) {
    return plasmicGetJson(buildModelReadUrl(context.cmsId, input, "query"), context);
  },
  count_items(input, context) {
    return plasmicGetJson(buildModelReadUrl(context.cmsId, input, "count"), context);
  },
};

export const executors: ProviderExecutors = defineProviderExecutors<PlasmicContext>({
  service,
  handlers: plasmicActionHandlers,
  async createContext(context: ExecutionContext, fetcher: ProviderFetch): Promise<PlasmicContext> {
    const credential = await requireApiKeyCredential(context, service);
    return {
      apiKey: credential.apiKey,
      cmsId: readStoredCmsId(credential.metadata, credential.values),
      fetcher,
      signal: context.signal,
    };
  },
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: plasmicCmsBaseUrl,
  auth: { type: "api_key_header", name: plasmicCmsTokenHeaderName },
  customizeRequest({ headers, credential }) {
    if (!credential || credential.authType !== "api_key") {
      throw new ProviderRequestError(401, "Configure plasmic API key credentials first.");
    }
    const cmsId = readStoredCmsId(credential.metadata, credential.values);
    headers.set("accept", "application/json");
    headers.set(plasmicCmsTokenHeaderName, `${cmsId}:${credential.apiKey}`);
  },
});

function buildModelReadUrl(cmsId: string, input: Record<string, unknown>, endpoint: "query" | "count"): URL {
  const modelId = requiredString(input.modelId, "modelId", (message) => new ProviderRequestError(400, message));
  const url = new URL(
    `/api/v1/cms/databases/${encodeURIComponent(cmsId)}/tables/${encodeURIComponent(modelId)}/${endpoint}`,
    plasmicDataBaseUrl,
  );

  const query = optionalRecord(input.query);
  if (query) {
    url.searchParams.set("q", JSON.stringify(query));
  }
  if (optionalBoolean(input.draft) === true) {
    url.searchParams.set("draft", "1");
  }
  const locale = optionalString(input.locale);
  if (locale) {
    url.searchParams.set("locale", locale);
  }

  return url;
}

async function plasmicGetJson(url: URL, context: PlasmicContext): Promise<unknown> {
  const timeout = createProviderTimeout(context.signal, plasmicDefaultRequestTimeoutMs);
  let response: Response, payload: unknown;
  try {
    response = await context.fetcher(url, {
      method: "GET",
      headers: plasmicHeaders(context.cmsId, context.apiKey),
      signal: timeout.signal,
    });
    payload = await readPlasmicPayload(response);
  } catch (error) {
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `plasmic request failed: ${error.message}` : "plasmic request failed",
    );
  } finally {
    timeout.cleanup();
  }

  if (!response.ok) {
    throw createPlasmicError(response, payload);
  }

  return payload;
}

function plasmicHeaders(cmsId: string, apiKey: string): Record<string, string> {
  return {
    accept: "application/json",
    "user-agent": providerUserAgent,
    [plasmicCmsTokenHeaderName]: `${cmsId}:${apiKey}`,
  };
}

async function readPlasmicPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text.trim()) {
    return {};
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "invalid JSON returned by plasmic");
  }
}

function createPlasmicError(response: Response, payload: unknown): ProviderRequestError {
  const message = extractPlasmicErrorMessage(payload) ?? response.statusText;
  return new ProviderRequestError(
    mapPlasmicStatus(response.status),
    message ? `plasmic request failed: ${message}` : "plasmic request failed",
    payload,
  );
}

function mapPlasmicStatus(status: number): number {
  if (status === 401 || status === 403) return 403;
  if (status >= 400 && status < 500) return status;
  return status >= 500 ? 502 : status;
}

function extractPlasmicErrorMessage(payload: unknown): string | undefined {
  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }
  return optionalString(record.message) ?? optionalString(record.error) ?? optionalString(record.detail);
}

function readStoredCmsId(
  metadata: Record<string, unknown> | undefined,
  values: Record<string, string> | undefined,
): string {
  const cmsId = optionalString(metadata?.cmsId) ?? optionalString(values?.cmsId);
  if (!cmsId) {
    throw new ProviderRequestError(400, "plasmic action requires cmsId in providerMetadata");
  }
  return cmsId;
}
