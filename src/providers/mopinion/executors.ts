import type {
  CredentialValidationResult,
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";
import type { ProviderFetch } from "../provider-runtime.ts";
import type { MopinionActionName } from "./actions.ts";

import { Buffer } from "node:buffer";
import { createHmac } from "node:crypto";
import { optionalRecord, optionalScalarString, optionalString, requiredString } from "../../core/cast.ts";
import {
  createProviderFetch,
  createProviderProxyUrl,
  defineProviderExecutors,
  normalizeProviderProxyEndpoint,
  normalizeProviderProxyHeaders,
  ProviderRequestError,
  providerUserAgent,
  readProviderProxyErrorMessage,
  readProviderProxyResponse,
  requireCustomCredential,
  toProviderProxyError,
} from "../provider-runtime.ts";

const service = "mopinion";
const mopinionApiBaseUrl = "https://api.mopinion.com";
const mopinionFetch = createProviderFetch({ skipDnsValidation: true });
const mopinionApiVersion = "3.0.0";
const accountPath = "/account";

type MopinionRequestPhase = "validate" | "execute";
type MopinionActionHandler = (input: Record<string, unknown>, context: MopinionActionContext) => Promise<unknown>;
type MopinionQueryValue = string | number | boolean | undefined;

interface MopinionCredentials {
  publicKey: string;
  signatureToken: string;
}

interface MopinionActionContext extends MopinionCredentials {
  fetcher: ProviderFetch;
  signal?: AbortSignal;
}

interface MopinionCollectionPayload {
  items: Array<Record<string, unknown>>;
  meta: Record<string, unknown> | null;
}

export const mopinionActionHandlers: Record<MopinionActionName, MopinionActionHandler> = {
  async get_account(_input, context): Promise<unknown> {
    return {
      account: await requestMopinionJson({
        path: accountPath,
        credentials: context,
        fetcher: context.fetcher,
        signal: context.signal,
        phase: "execute",
      }),
    };
  },
  async get_report(input, context): Promise<unknown> {
    const reportId = readRequiredInputString(input.reportId, "reportId");
    return {
      report: await requestMopinionJson({
        path: `/reports/${encodeURIComponent(reportId)}`,
        credentials: context,
        fetcher: context.fetcher,
        signal: context.signal,
        phase: "execute",
      }),
    };
  },
  async get_dataset(input, context): Promise<unknown> {
    const datasetId = readRequiredInputString(input.datasetId, "datasetId");
    return {
      dataset: await requestMopinionJson({
        path: `/datasets/${encodeURIComponent(datasetId)}`,
        credentials: context,
        fetcher: context.fetcher,
        signal: context.signal,
        phase: "execute",
      }),
    };
  },
  async list_deployments(input, context): Promise<unknown> {
    const payload = await requestMopinionCollection({
      path: "/deployments",
      query: buildPaginationQuery(input),
      context,
    });

    return {
      deployments: payload.items,
      meta: payload.meta,
    };
  },
  async get_deployment(input, context): Promise<unknown> {
    const deploymentId = readRequiredInputString(input.deploymentId, "deploymentId");
    return {
      deployment: await requestMopinionJson({
        path: `/deployments/${encodeURIComponent(deploymentId)}`,
        credentials: context,
        fetcher: context.fetcher,
        signal: context.signal,
        phase: "execute",
      }),
    };
  },
  async list_dataset_feedback(input, context): Promise<unknown> {
    const datasetId = readRequiredInputString(input.datasetId, "datasetId");
    const payload = await requestMopinionCollection({
      path: `/datasets/${encodeURIComponent(datasetId)}/feedback`,
      query: buildFeedbackQuery(input),
      context,
    });

    return {
      feedback: payload.items,
      meta: payload.meta,
    };
  },
  async get_dataset_feedback(input, context): Promise<unknown> {
    const datasetId = readRequiredInputString(input.datasetId, "datasetId");
    const feedbackId = readRequiredInputString(input.feedbackId, "feedbackId");
    return {
      feedback: await requestMopinionJson({
        path: `/datasets/${encodeURIComponent(datasetId)}/feedback/${encodeURIComponent(feedbackId)}`,
        credentials: context,
        fetcher: context.fetcher,
        signal: context.signal,
        phase: "execute",
      }),
    };
  },
  async list_report_feedback(input, context): Promise<unknown> {
    const reportId = readRequiredInputString(input.reportId, "reportId");
    const payload = await requestMopinionCollection({
      path: `/reports/${encodeURIComponent(reportId)}/feedback`,
      query: buildFeedbackQuery(input),
      context,
    });

    return {
      feedback: payload.items,
      meta: payload.meta,
    };
  },
  async get_report_feedback(input, context): Promise<unknown> {
    const reportId = readRequiredInputString(input.reportId, "reportId");
    const feedbackId = readRequiredInputString(input.feedbackId, "feedbackId");
    return {
      feedback: await requestMopinionJson({
        path: `/reports/${encodeURIComponent(reportId)}/feedback/${encodeURIComponent(feedbackId)}`,
        credentials: context,
        fetcher: context.fetcher,
        signal: context.signal,
        phase: "execute",
      }),
    };
  },
  async list_dataset_fields(input, context): Promise<unknown> {
    const datasetId = readRequiredInputString(input.datasetId, "datasetId");
    const payload = await requestMopinionCollection({
      path: `/datasets/${encodeURIComponent(datasetId)}/fields`,
      context,
    });

    return {
      fields: payload.items,
      meta: payload.meta,
    };
  },
  async list_report_fields(input, context): Promise<unknown> {
    const reportId = readRequiredInputString(input.reportId, "reportId");
    const payload = await requestMopinionCollection({
      path: `/reports/${encodeURIComponent(reportId)}/fields`,
      context,
    });

    return {
      fields: payload.items,
      meta: payload.meta,
    };
  },
};

export const executors: ProviderExecutors = defineProviderExecutors<MopinionActionContext>({
  service,
  handlers: mopinionActionHandlers,
  skipDnsValidation: true,
  async createContext(context: ExecutionContext, fetcher: ProviderFetch): Promise<MopinionActionContext> {
    const credential = await requireCustomCredential(context, service);
    return {
      ...resolveMopinionCredentials(credential.values),
      fetcher,
      signal: context.signal,
    };
  },
});

export const proxy: ProviderProxyExecutor = async (input, context) => {
  try {
    const credential = await requireCustomCredential(context, service);
    const credentials = resolveMopinionCredentials(credential.values);
    const endpoint = normalizeProviderProxyEndpoint(input.endpoint);
    const url = createProviderProxyUrl(mopinionApiBaseUrl, endpoint, input.query);
    const headers = normalizeProviderProxyHeaders(input.headers);
    const body =
      input.body === undefined ? undefined : typeof input.body === "string" ? input.body : JSON.stringify(input.body);
    headers.set("version", mopinionApiVersion);
    headers.set("user-agent", providerUserAgent);
    headers.set(
      "x-auth-token",
      createMopinionAuthToken({
        ...credentials,
        path: endpoint,
        body,
      }),
    );

    const init: RequestInit = {
      method: input.method,
      headers,
      body,
      signal: context.signal,
    };
    if (input.body !== undefined && !headers.has("content-type") && typeof input.body !== "string") {
      headers.set("content-type", "application/json");
    }

    const response = await mopinionFetch(url, init);
    if (!response.ok) {
      const text = await readProviderProxyErrorMessage(response, "");
      throw new ProviderRequestError(response.status, text || `Mopinion request failed with HTTP ${response.status}`);
    }

    return { ok: true, response: await readProviderProxyResponse(response) };
  } catch (error) {
    return toProviderProxyError(error, "Mopinion request failed");
  }
};

export const credentialValidators: CredentialValidators = {
  async customCredential(input, { fetcher, signal }): Promise<CredentialValidationResult> {
    const credentials = resolveMopinionCredentials(input.values);
    const account = requiredRecord(
      await requestMopinionJson({
        path: accountPath,
        credentials,
        fetcher,
        signal,
        phase: "validate",
      }),
      "Mopinion account response",
    );
    const accountName = optionalString(account.name) ?? credentials.publicKey;

    return {
      profile: {
        accountId: `mopinion:${credentials.publicKey}`,
        displayName: accountName,
      },
      grantedScopes: [],
      metadata: {
        accountName: optionalString(account.name),
        package: optionalString(account.package),
        apiVersion: mopinionApiVersion,
      },
    };
  },
};

async function requestMopinionCollection(input: {
  path: string;
  context: MopinionActionContext;
  query?: Array<[string, MopinionQueryValue]>;
}): Promise<MopinionCollectionPayload> {
  const payload = await requestMopinionJson({
    path: input.path,
    query: input.query,
    credentials: input.context,
    fetcher: input.context.fetcher,
    signal: input.context.signal,
    phase: "execute",
  });

  return normalizeCollection(payload);
}

async function requestMopinionJson(input: {
  path: string;
  credentials: MopinionCredentials;
  fetcher: ProviderFetch;
  phase: MopinionRequestPhase;
  signal?: AbortSignal;
  query?: Array<[string, MopinionQueryValue]>;
}): Promise<unknown> {
  const url = new URL(input.path, mopinionApiBaseUrl);
  for (const [key, value] of input.query ?? []) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }

  let response: Response;
  try {
    response = await input.fetcher(url, {
      method: "GET",
      headers: {
        accept: "application/json",
        version: mopinionApiVersion,
        "user-agent": providerUserAgent,
        "x-auth-token": createMopinionAuthToken({
          ...input.credentials,
          path: input.path,
        }),
      },
      signal: input.signal,
    });
  } catch (error) {
    throw new ProviderRequestError(
      error instanceof DOMException && error.name === "AbortError" ? 504 : 502,
      error instanceof Error ? error.message : "Mopinion request failed",
    );
  }

  if (response.ok) {
    return readMopinionJson(response);
  }

  const message = await readMopinionError(response);
  if (input.phase === "validate" && response.status === 401) {
    throw new ProviderRequestError(400, message);
  }
  throw new ProviderRequestError(response.status || 502, message);
}

async function readMopinionJson(response: Response): Promise<unknown> {
  try {
    return (await response.json()) as unknown;
  } catch (error) {
    throw new ProviderRequestError(502, error instanceof Error ? error.message : "invalid Mopinion JSON response");
  }
}

function createMopinionAuthToken(input: {
  publicKey: string;
  signatureToken: string;
  path: string;
  body?: string;
}): string {
  const signature = createHmac("sha256", input.signatureToken)
    .update(`${input.path}|${input.body ?? ""}`)
    .digest("hex");

  return Buffer.from(`${input.publicKey}:${signature}`).toString("base64");
}

function normalizeCollection(payload: unknown): MopinionCollectionPayload {
  if (Array.isArray(payload)) {
    return {
      items: payload.map((item) => requiredRecord(item, "Mopinion collection item")),
      meta: null,
    };
  }

  const object = optionalRecord(payload);
  if (!object) {
    return {
      items: [],
      meta: null,
    };
  }

  if (Array.isArray(object.data)) {
    return {
      items: object.data.map((item) => requiredRecord(item, "Mopinion collection item")),
      meta: optionalRecord(object._meta) ?? null,
    };
  }

  if (Array.isArray(object.member)) {
    return {
      items: object.member.map((item) => requiredRecord(item, "Mopinion collection item")),
      meta: optionalRecord(object._meta) ?? null,
    };
  }

  return {
    items: [object],
    meta: null,
  };
}

function buildPaginationQuery(input: Record<string, unknown>): Array<[string, MopinionQueryValue]> {
  return [
    ["page", queryValue(input.page)],
    ["limit", queryValue(input.limit)],
  ];
}

function buildFeedbackQuery(input: Record<string, unknown>): Array<[string, MopinionQueryValue]> {
  const query: Array<[string, MopinionQueryValue]> = [
    ["page", queryValue(input.page)],
    ["limit", queryValue(input.limit)],
    ["sort", queryValue(input.sort)],
    ["order", queryValue(input.order)],
  ];
  const filters = optionalRecord(input.filters);
  for (const [key, value] of Object.entries(filters ?? {})) {
    query.push([`filter[${key}]`, queryValue(value)]);
  }

  return query;
}

function queryValue(value: unknown): MopinionQueryValue {
  return optionalScalarString(value);
}

function resolveMopinionCredentials(input: Record<string, string>): MopinionCredentials {
  return {
    publicKey: readRequiredInputString(input.publicKey, "publicKey"),
    signatureToken: readRequiredInputString(input.signatureToken, "signatureToken"),
  };
}

function readRequiredInputString(value: unknown, fieldName: string): string {
  return requiredString(value, fieldName, (message) => new ProviderRequestError(400, message));
}

function requiredRecord(value: unknown, label: string): Record<string, unknown> {
  const record = optionalRecord(value);
  if (!record) {
    throw new ProviderRequestError(502, `invalid ${label}`);
  }
  return record;
}

async function readMopinionError(response: Response): Promise<string> {
  try {
    const payload = requiredRecord(await response.json(), "Mopinion error response");
    const title = optionalString(payload.title);
    const detail = optionalString(payload.detail);
    const errorCode =
      typeof payload.error_code === "string" || typeof payload.error_code === "number"
        ? String(payload.error_code)
        : undefined;
    const fallback = `Mopinion request failed with status ${response.status}`;
    const message = title ?? detail ?? fallback;
    return errorCode ? `${message} (${errorCode})` : message;
  } catch {
    return (await response.text().catch(() => "")) || `Mopinion request failed with status ${response.status}`;
  }
}
