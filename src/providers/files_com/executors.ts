import type {
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";
import type { FilesComActionName } from "./actions.ts";

import { compactObject, optionalInteger, optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import {
  defineProviderExecutors,
  defineProviderProxy,
  providerUserAgent,
  ProviderRequestError,
  requireApiKeyCredential,
} from "../provider-runtime.ts";

const service = "files_com";
const filesComApiHostSuffix = ".files.com";
const filesComApiPathPrefix = "/api/rest/v1";
const filesComValidationEndpoint = "/users/me.json";
const filesComDefaultRequestTimeoutMs = 30_000;

interface FilesComActionContext extends ApiKeyProviderContext {
  subdomain: string;
}

type FilesComRequestPhase = "validate" | "execute";
type FilesComActionHandler = (input: Record<string, unknown>, context: FilesComActionContext) => Promise<unknown>;

interface FilesComRequestInput {
  subdomain: string;
  apiKey: string;
  path: string;
  fetcher: typeof fetch;
  phase: FilesComRequestPhase;
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  query?: Record<string, string | undefined>;
  body?: Record<string, unknown>;
  signal?: AbortSignal;
}

export const filesComActionHandlers: Record<FilesComActionName, FilesComActionHandler> = {
  list_folder(input, context) {
    const page = optionalInteger(input.page);
    const perPage = optionalInteger(input.perPage);
    return requestAndWrapFilesComList(
      {
        context,
        path: `/folders/${encodeRemotePath(readInputString(input.path, "path"))}.json`,
        query: compactObject({
          page: page === undefined ? undefined : String(page),
          per_page: perPage === undefined ? undefined : String(perPage),
        }),
      },
      page ?? 1,
      perPage ?? 100,
    );
  },
  get_file(input, context) {
    return requestAndWrapFilesComJson({
      context,
      path: `/files/${encodeRemotePath(readInputString(input.path, "path"))}.json`,
      wrapper: "file",
    });
  },
  create_folder(input, context) {
    return requestAndWrapFilesComJson({
      context,
      path: `/folders/${encodeRemotePath(readInputString(input.path, "path"))}.json`,
      method: "POST",
      body: compactObject({
        mkdir_parents: input.mkdirParents,
      }),
      wrapper: "file",
    });
  },
  update_metadata(input, context) {
    return requestAndWrapFilesComJson({
      context,
      path: `/files/${encodeRemotePath(readInputString(input.path, "path"))}.json`,
      method: "PATCH",
      body: {
        custom_metadata: optionalRecord(input.customMetadata) ?? {},
      },
      wrapper: "file",
    });
  },
  async delete_file(input, context) {
    const path = readInputString(input.path, "path");
    const raw = await requestFilesComJson({
      subdomain: context.subdomain,
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      signal: context.signal,
      phase: "execute",
      path: `/files/${encodeRemotePath(path)}.json`,
      method: "DELETE",
    });
    return { deleted: true, path, raw };
  },
};

export const executors: ProviderExecutors = defineProviderExecutors<FilesComActionContext>({
  service,
  handlers: filesComActionHandlers,
  async createContext(context: ExecutionContext, fetcher: typeof fetch): Promise<FilesComActionContext> {
    const credential = await requireApiKeyCredential(context, service);
    return {
      apiKey: credential.apiKey,
      subdomain: requireFilesComSubdomain(credential.values.subdomain ?? credential.metadata.subdomain),
      fetcher,
      signal: context.signal,
    };
  },
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: async (context) => {
    const credential = await requireApiKeyCredential(context, service);
    const subdomain = requireFilesComSubdomain(credential.values.subdomain ?? credential.metadata.subdomain);
    return buildFilesComApiBaseUrl(subdomain);
  },
  auth: { type: "api_key_header", name: "x-filesapi-key" },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const subdomain = requireFilesComSubdomain(input.values.subdomain);
    const payload = await requestFilesComJson({
      subdomain,
      apiKey: input.apiKey,
      fetcher,
      signal,
      phase: "validate",
      path: filesComValidationEndpoint,
    });

    return {
      profile: {
        accountId: subdomain,
        displayName: pickAccountLabel(payload) ?? `${subdomain}.files.com`,
      },
      grantedScopes: [],
      metadata: {
        subdomain,
        apiBaseUrl: buildFilesComApiBaseUrl(subdomain),
        validationEndpoint: filesComValidationEndpoint,
      },
    };
  },
};

async function requestAndWrapFilesComJson(input: {
  context: FilesComActionContext;
  path: string;
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: Record<string, unknown>;
  wrapper: string;
}): Promise<Record<string, unknown>> {
  const payload = await requestFilesComJson({
    subdomain: input.context.subdomain,
    apiKey: input.context.apiKey,
    fetcher: input.context.fetcher,
    signal: input.context.signal,
    phase: "execute",
    path: input.path,
    method: input.method,
    body: input.body,
  });
  return { [input.wrapper]: payload };
}

async function requestAndWrapFilesComList(
  input: {
    context: FilesComActionContext;
    path: string;
    query?: Record<string, string | undefined>;
  },
  page: number,
  perPage: number,
): Promise<Record<string, unknown>> {
  const payload = await requestFilesComJson({
    subdomain: input.context.subdomain,
    apiKey: input.context.apiKey,
    fetcher: input.context.fetcher,
    signal: input.context.signal,
    phase: "execute",
    path: input.path,
    query: input.query,
  });
  const entries = optionalRecord(payload)?.entries;
  const items = Array.isArray(payload) ? payload : (readObjectArray(entries) ?? []);
  return {
    items,
    page,
    perPage,
    raw: payload,
  };
}

async function requestFilesComJson(input: FilesComRequestInput): Promise<unknown> {
  const url = new URL(`${filesComApiPathPrefix}${input.path}`, `https://${input.subdomain}${filesComApiHostSuffix}`);
  for (const [key, value] of Object.entries(input.query ?? {})) {
    if (value !== undefined) {
      url.searchParams.set(key, value);
    }
  }

  const signal = input.signal
    ? AbortSignal.any([input.signal, AbortSignal.timeout(filesComDefaultRequestTimeoutMs)])
    : AbortSignal.timeout(filesComDefaultRequestTimeoutMs);

  try {
    const response = await input.fetcher(url, {
      method: input.method ?? "GET",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        "user-agent": providerUserAgent,
        "x-filesapi-key": input.apiKey,
      },
      body: input.body ? JSON.stringify(input.body) : undefined,
      signal,
    });
    const payload = await readFilesComPayload(response);
    if (!response.ok) {
      throw mapFilesComError(response.status, payload, input.phase);
    }

    return payload;
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    if (isAbortError(error)) {
      throw new ProviderRequestError(504, "Files.com request timed out");
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Files.com request failed: ${error.message}` : "Files.com request failed",
    );
  }
}

function buildFilesComApiBaseUrl(subdomain: string): string {
  return `https://${subdomain}${filesComApiHostSuffix}${filesComApiPathPrefix}`;
}

function requireFilesComSubdomain(value: unknown): string {
  const trimmed = optionalString(value)?.toLowerCase();
  if (!trimmed) {
    throw new ProviderRequestError(400, "subdomain is required");
  }
  if (trimmed.includes("/") || trimmed.includes(".")) {
    throw new ProviderRequestError(400, "subdomain must be a Files.com site subdomain");
  }
  return trimmed;
}

function readInputString(value: unknown, fieldName: string): string {
  return requiredString(value, fieldName, (message) => new ProviderRequestError(400, message));
}

function encodeRemotePath(path: string): string {
  return path
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

function readObjectArray(value: unknown): Array<Record<string, unknown>> | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  return value.filter((item): item is Record<string, unknown> => Boolean(optionalRecord(item)));
}

async function readFilesComPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return {};
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { message: text };
  }
}

function mapFilesComError(status: number, payload: unknown, phase: FilesComRequestPhase): ProviderRequestError {
  const message = readFilesComErrorMessage(payload) ?? `Files.com API returned HTTP ${status}`;
  if (phase === "validate" && (status === 401 || status === 403)) {
    return new ProviderRequestError(400, message, payload);
  }
  if (status === 401 || status === 403) {
    return new ProviderRequestError(401, message, payload);
  }
  if (status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if (status >= 400 && status < 500) {
    return new ProviderRequestError(400, message, payload);
  }
  return new ProviderRequestError(status || 502, message, payload);
}

function readFilesComErrorMessage(payload: unknown): string | undefined {
  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }
  return (
    optionalString(record.message) ??
    optionalString(record.error) ??
    optionalString(record.error_message) ??
    optionalString(record.title)
  );
}

function pickAccountLabel(payload: unknown): string | undefined {
  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }
  return optionalString(record.username) ?? optionalString(record.name) ?? optionalString(record.email);
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError");
}
