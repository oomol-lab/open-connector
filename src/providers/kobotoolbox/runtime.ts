import {
  compactObject,
  optionalInteger,
  optionalRecord,
  optionalString,
  pickOptionalBoolean,
  pickOptionalInteger,
  pickOptionalString,
} from "../../core/cast.ts";
import { assertPublicHttpUrl, isPrivateNetworkAccessAllowed } from "../../core/request.ts";
import { createProviderTimeout, ProviderRequestError, providerUserAgent } from "../provider-runtime.ts";

interface ApiKeyProviderActionInput {
  apiKey: string;
  input: Record<string, unknown>;
  providerMetadata: Record<string, unknown>;
  signal?: AbortSignal;
}
interface ProviderProxyFetchInput {
  fetcher: typeof fetch;
  url: URL;
  init?: RequestInit;
}
interface ValidateCredentialResult {
  providerAccountId?: string;
  accountLabel: string;
  providerMetadata: Record<string, unknown>;
}
function requireApiKey(input: { apiKey?: string }): string {
  if (!input.apiKey?.trim()) throw new ProviderRequestError(400, "apiKey is required");
  return input.apiKey.trim();
}

type RequestPhase = "validate" | "execute" | "trigger";
type Handler = (input: ApiKeyProviderActionInput, fetcher: typeof fetch) => Promise<unknown>;

const koboToolboxMaxResponseBytes = 10 * 1024 * 1024;

export const koboToolboxActionHandlers: Record<string, Handler> = {
  async list_assets(input, fetcher) {
    return normalizePage(
      await requestForAction(input, fetcher, "/api/v2/assets/", {
        query: compactObject({
          q: pickOptionalString(input.input, "query"),
          ordering: pickOptionalString(input.input, "ordering"),
          limit: pickOptionalInteger(input.input, "limit"),
          start: pickOptionalInteger(input.input, "start"),
        }),
      }),
      "assets",
    );
  },

  async get_asset(input, fetcher) {
    return {
      asset: requireResponseObject(
        await requestForAction(
          input,
          fetcher,
          `/api/v2/assets/${encodeURIComponent(requireInputString(input.input, "assetUid"))}/`,
          { notFound: true },
        ),
        "asset",
      ),
    };
  },

  async create_project(input, fetcher) {
    const settings = compactObject({
      description: optionalString(input.input.description),
      sector: optionalString(input.input.sector),
      country: optionalString(input.input.country),
      "share-metadata": pickOptionalBoolean(input.input, "shareMetadata"),
    });
    return {
      asset: requireResponseObject(
        await requestForAction(input, fetcher, "/api/v2/assets/", {
          method: "POST",
          body: {
            name: requireInputString(input.input, "name"),
            asset_type: "survey",
            ...(Object.keys(settings).length === 0 ? {} : { settings }),
          },
        }),
        "asset",
      ),
    };
  },

  async clone_project(input, fetcher) {
    return {
      asset: requireResponseObject(
        await requestForAction(input, fetcher, "/api/v2/assets/", {
          method: "POST",
          body: {
            name: requireInputString(input.input, "name"),
            clone_from: requireInputString(input.input, "sourceAssetUid"),
            asset_type: "survey",
          },
        }),
        "asset",
      ),
    };
  },

  async deploy_project(input, fetcher) {
    const assetUid = requireInputString(input.input, "assetUid");
    return {
      deployment: requireResponseObject(
        await requestForAction(input, fetcher, `/api/v2/assets/${encodeURIComponent(assetUid)}/deployment/`, {
          method: "POST",
          body: { active: true },
          notFound: true,
        }),
        "deployment",
      ),
    };
  },

  async list_submissions(input, fetcher) {
    const assetUid = requireInputString(input.input, "assetUid");
    return normalizePage(
      await requestForAction(input, fetcher, `/api/v2/assets/${encodeURIComponent(assetUid)}/data/`, {
        query: compactObject({
          query: stringifyQueryValue(input.input.query),
          sort: stringifyQueryValue(input.input.sort),
          fields: stringifyQueryValue(input.input.fields),
          limit: pickOptionalInteger(input.input, "limit"),
          start: pickOptionalInteger(input.input, "start"),
        }),
        notFound: true,
      }),
      "submissions",
    );
  },

  async get_submission(input, fetcher) {
    return {
      submission: requireResponseObject(
        await requestForAction(input, fetcher, submissionPath(input.input), { notFound: true }),
        "submission",
      ),
    };
  },

  async set_submission_validation(input, fetcher) {
    return {
      validation: requireResponseObject(
        await requestForAction(input, fetcher, `${submissionPath(input.input)}validation_status/`, {
          method: "PATCH",
          body: { "validation_status.uid": requireInputString(input.input, "status") },
          notFound: true,
        }),
        "validation",
      ),
    };
  },

  async delete_submission(input, fetcher) {
    await requestForAction(input, fetcher, submissionPath(input.input), {
      method: "DELETE",
      notFound: true,
    });
    return { deleted: true };
  },

  async start_export(input, fetcher) {
    const assetUid = requireInputString(input.input, "assetUid");
    const exportTask = requireResponseObject(
      await requestForAction(input, fetcher, `/api/v2/assets/${encodeURIComponent(assetUid)}/exports/`, {
        method: "POST",
        body: {
          fields: Array.isArray(input.input.fields) ? input.input.fields : [],
          fields_from_all_versions: pickOptionalBoolean(input.input, "fieldsFromAllVersions") ?? false,
          group_sep: optionalString(input.input.groupSeparator) ?? "/",
          hierarchy_in_labels: pickOptionalBoolean(input.input, "hierarchyInLabels") ?? false,
          include_media_url: pickOptionalBoolean(input.input, "includeMediaUrls") ?? false,
          lang: optionalString(input.input.language) ?? "_xml",
          multiple_select: optionalString(input.input.multipleSelect) ?? "both",
          submissions_id: Array.isArray(input.input.submissionIds) ? input.input.submissionIds : [],
          query: optionalRecord(input.input.query) ?? {},
          type: requireInputString(input.input, "format"),
          flatten: pickOptionalBoolean(input.input, "flatten") ?? false,
          xls_types_as_text: pickOptionalBoolean(input.input, "xlsTypesAsText") ?? false,
        },
        notFound: true,
      }),
      "export",
    );
    return {
      export: exportTask,
      exportHandle: createKoboToolboxExportHandle(assetUid, requireProviderString(exportTask.uid, "export.uid")),
    };
  },

  async get_export(input, fetcher) {
    const { assetUid, exportId } = parseKoboToolboxExportHandle(requireInputString(input.input, "exportHandle"));
    return {
      export: requireResponseObject(
        await requestForAction(
          input,
          fetcher,
          `/api/v2/assets/${encodeURIComponent(assetUid)}/exports/${encodeURIComponent(exportId)}/`,
          { notFound: true },
        ),
        "export",
      ),
    };
  },
};

export async function validateKoboToolboxCredential(
  input: Record<string, string>,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<ValidateCredentialResult> {
  const apiKey = requireApiKey(input);
  const baseUrl = normalizeKoboToolboxBaseUrl(input.baseUrl);
  const profile = requireResponseObject(
    await requestKoboToolboxJson({
      baseUrl,
      apiKey,
      path: "/me/",
      phase: "validate",
      fetcher,
      signal,
    }),
    "current user profile",
  );
  const username = requireProviderString(profile.username, "current user profile username");

  const host = new URL(baseUrl).host;
  return {
    providerAccountId: `kobotoolbox:${host}:${username}`,
    accountLabel: `KoboToolbox ${username}`,
    providerMetadata: {
      baseUrl,
      apiBaseUrl: baseUrl,
      validationEndpoint: "/me/",
    },
  };
}

export function normalizeKoboToolboxBaseUrl(
  value: unknown,
  allowPrivateNetwork: boolean = isPrivateNetworkAccessAllowed(),
): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new ProviderRequestError(400, "baseUrl is required");
  }
  const url = assertPublicHttpUrl(value.trim(), {
    fieldName: "baseUrl",
    createError: (message) => new ProviderRequestError(400, message),
    allowPrivateNetwork,
  });
  if (url.protocol !== "https:") {
    throw new ProviderRequestError(400, "baseUrl must use https");
  }
  if (url.pathname !== "/") {
    throw new ProviderRequestError(400, "baseUrl must be the KoboToolbox server root URL without a path");
  }
  url.search = "";
  url.hash = "";
  return url.toString().replace(/\/$/, "");
}

export function resolveKoboToolboxBaseUrl(context: { providerMetadata: Record<string, unknown> }): string {
  return storedBaseUrl(context.providerMetadata);
}

export async function fetchKoboToolboxProxy(input: ProviderProxyFetchInput): Promise<Response> {
  return input.fetcher(input.url, input.init);
}

export async function requestKoboToolboxJson(input: {
  baseUrl: string;
  apiKey: string;
  path: string;
  fetcher: typeof fetch;
  phase: RequestPhase;
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  query?: Record<string, unknown>;
  body?: unknown;
  notFound?: boolean;
  signal?: AbortSignal;
}): Promise<unknown> {
  const timeout = createProviderTimeout(input.signal, 30_000);
  const url = new URL(input.path, `${normalizeKoboToolboxBaseUrl(input.baseUrl)}/`);
  for (const [key, value] of Object.entries(input.query ?? {})) {
    if (value !== undefined) url.searchParams.set(key, String(value));
  }

  try {
    const response = await input.fetcher(url, {
      method: input.method ?? "GET",
      headers: {
        accept: "application/json",
        authorization: `Token ${input.apiKey}`,
        "user-agent": providerUserAgent,
        ...(input.body === undefined ? {} : { "content-type": "application/json" }),
      },
      ...(input.body === undefined ? {} : { body: JSON.stringify(input.body) }),
      signal: timeout.signal,
    });
    const payload = await readPayload(response);
    if (!response.ok) {
      throw mapKoboToolboxError(response.status, payload, input.phase, input.notFound);
    }
    return payload;
  } catch (error) {
    if (error instanceof ProviderRequestError) throw error;
    if (timeout.didTimeout() || (error instanceof Error && error.name === "AbortError")) {
      throw new ProviderRequestError(504, "KoboToolbox request timed out");
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `KoboToolbox request failed: ${error.message}` : "KoboToolbox request failed",
    );
  } finally {
    timeout.cleanup();
  }
}

function requestForAction(
  input: ApiKeyProviderActionInput,
  fetcher: typeof fetch,
  path: string,
  options: {
    method?: "GET" | "POST" | "PATCH" | "DELETE";
    query?: Record<string, unknown>;
    body?: unknown;
    notFound?: boolean;
  } = {},
) {
  return requestKoboToolboxJson({
    baseUrl: storedBaseUrl(input.providerMetadata),
    apiKey: input.apiKey,
    path,
    fetcher,
    phase: "execute",
    signal: input.signal,
    ...options,
  });
}

async function readPayload(response: Response) {
  if (response.status === 204) return {};
  const text = await readBoundedResponseText(response);
  if (!text) return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { detail: text };
  }
}

async function readBoundedResponseText(response: Response) {
  const contentLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > koboToolboxMaxResponseBytes) {
    await response.body?.cancel().catch(() => undefined);
    throw responseTooLargeError();
  }
  if (!response.body) return "";

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let totalBytes = 0;
  let text = "";
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) return text + decoder.decode();
      totalBytes += chunk.value.byteLength;
      if (totalBytes > koboToolboxMaxResponseBytes) {
        await reader.cancel().catch(() => undefined);
        throw responseTooLargeError();
      }
      text += decoder.decode(chunk.value, { stream: true });
    }
  } finally {
    reader.releaseLock();
  }
}

function responseTooLargeError() {
  return new ProviderRequestError(502, `KoboToolbox response exceeds ${koboToolboxMaxResponseBytes} bytes`);
}

function mapKoboToolboxError(status: number, payload: unknown, phase: RequestPhase, notFound?: boolean) {
  const message = extractErrorMessage(payload) ?? `KoboToolbox request failed with status ${status}`;
  if (status === 401) {
    return new ProviderRequestError(phase === "validate" ? 400 : status, message);
  }
  if (status === 403) {
    return new ProviderRequestError(phase === "validate" ? 400 : status, message);
  }
  if (status === 404 && notFound) return new ProviderRequestError(404, message);
  if (status === 429) return new ProviderRequestError(429, message);
  return new ProviderRequestError(status >= 500 ? 502 : status, message);
}

function extractErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim()) return payload.trim();
  const object = optionalRecord(payload);
  if (!object) return undefined;
  const direct = optionalString(object.detail) ?? optionalString(object.error);
  if (direct?.trim()) return direct.trim();
  if (object.detail !== undefined) return stringifyErrorValue(object.detail);
  return stringifyErrorValue(object);
}

function stringifyErrorValue(value: unknown): string | undefined {
  if (typeof value === "string") return value.trim() || undefined;
  if (Array.isArray(value)) {
    const messages = value.map(stringifyErrorValue).filter((item): item is string => Boolean(item));
    return messages.length > 0 ? messages.join(", ") : undefined;
  }
  const object = optionalRecord(value);
  if (!object) return undefined;
  const messages = Object.entries(object)
    .map(([key, item]) => {
      const message = stringifyErrorValue(item);
      return message ? `${key}: ${message}` : undefined;
    })
    .filter((item): item is string => Boolean(item));
  return messages.length > 0 ? messages.join("; ") : undefined;
}

function storedBaseUrl(metadata?: Record<string, unknown>) {
  return normalizeKoboToolboxBaseUrl(metadata?.baseUrl ?? metadata?.apiBaseUrl);
}

function submissionPath(input: Record<string, unknown>) {
  const assetUid = requireInputString(input, "assetUid");
  const submissionId = requireInputString(input, "submissionId");
  return `/api/v2/assets/${encodeURIComponent(assetUid)}/data/${encodeURIComponent(submissionId)}/`;
}

function requireInputString(input: Record<string, unknown>, key: string) {
  const value = pickOptionalString(input, key);
  if (!value) throw new ProviderRequestError(400, `${key} is required`);
  return value;
}

function stringifyQueryValue(value: unknown) {
  return value === undefined ? undefined : JSON.stringify(value);
}

function requireResponseObject(payload: unknown, fieldName: string) {
  const object = optionalRecord(payload);
  if (!object) {
    throw new ProviderRequestError(502, `KoboToolbox response is missing ${fieldName}`);
  }
  return object;
}

function createKoboToolboxExportHandle(assetUid: string, exportId: string) {
  return JSON.stringify({ assetUid, exportId });
}

function parseKoboToolboxExportHandle(value: string) {
  try {
    const handle = optionalRecord(JSON.parse(value) as unknown);
    if (handle) {
      const assetUid = optionalString(handle.assetUid)?.trim();
      const exportId = optionalString(handle.exportId)?.trim();
      if (assetUid && exportId) return { assetUid, exportId };
    }
  } catch {
    // Report all malformed handles with the same error below.
  }
  throw new ProviderRequestError(400, "exportHandle must be returned by start_export");
}

function requireProviderString(value: unknown, fieldName: string) {
  const result = optionalString(value)?.trim();
  if (!result) {
    throw new ProviderRequestError(502, `${fieldName} is required`);
  }
  return result;
}

function normalizePage(payload: unknown, fieldName: "assets" | "submissions") {
  const object = requireResponseObject(payload, `${fieldName} page`);
  const results = object.results;
  if (!Array.isArray(results) || !results.every((item) => optionalRecord(item))) {
    throw new ProviderRequestError(502, `KoboToolbox response is missing ${fieldName}`);
  }
  return {
    [fieldName]: results,
    count: optionalInteger(object.count) ?? results.length,
    nextUrl: optionalString(object.next) ?? null,
    previousUrl: optionalString(object.previous) ?? null,
  };
}
