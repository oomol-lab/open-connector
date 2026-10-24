import type {
  CredentialValidationResult,
  CredentialValidators,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-executors.ts";

import { compactObject, optionalBoolean, optionalRecord, optionalString } from "../../core/cast.ts";
import { defineProviderExecutors, requireApiKeyCredential } from "../provider-executors.ts";
import { defineProviderProxy } from "../provider-proxy.ts";
import {
  ProviderRequestError,
  providerInputError,
  providerUserAgent,
  requiredInputString,
  runProviderRequest,
} from "../provider-runtime.ts";

const service = "sanity";
const sanityApiVersion = "v2025-02-19";
const sanityManagementApiVersion = "v2021-06-07";

interface SanityContext {
  projectId: string;
  apiKey: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

interface SanityRequestInput extends SanityContext {
  path: string;
  phase: "validate" | "execute";
  method?: string;
  query?: Record<string, string | number | boolean | undefined>;
  body?: Record<string, unknown>;
  management?: boolean;
}

type SanityHandler = (input: Record<string, unknown>, context: SanityContext) => Promise<unknown>;

const handlers: ProviderActionHandlers<"sanity", SanityHandler> = {
  query_documents(input, context) {
    const dataset = requiredInputString(input.dataset, "dataset");
    return requestSanityJson({
      ...context,
      method: "POST",
      phase: "execute",
      path: `/data/query/${encodeURIComponent(dataset)}`,
      query: compactObject({
        perspective: optionalString(input.perspective),
        tag: optionalString(input.tag),
        resultSourceMap: optionalBoolean(input.resultSourceMap),
        returnQuery: optionalBoolean(input.returnQuery),
      }),
      body: compactObject({ query: requiredInputString(input.query, "query"), params: optionalRecord(input.params) }),
    });
  },
  get_documents(input, context) {
    const dataset = requiredInputString(input.dataset, "dataset");
    const documentIds = Array.isArray(input.documentIds) ? input.documentIds.map(String) : [];
    return requestSanityJson({
      ...context,
      phase: "execute",
      path: `/data/doc/${encodeURIComponent(dataset)}/${documentIds.map(encodeURIComponent).join(",")}`,
      query: { includeAllVersions: optionalBoolean(input.includeAllVersions) },
    });
  },
  mutate_documents(input, context) {
    const dataset = requiredInputString(input.dataset, "dataset");
    return requestSanityJson({
      ...context,
      method: "POST",
      phase: "execute",
      path: `/data/mutate/${encodeURIComponent(dataset)}`,
      query: compactObject({
        returnIds: optionalBoolean(input.returnIds),
        returnDocuments: optionalBoolean(input.returnDocuments),
        autoGenerateArrayKeys: optionalBoolean(input.autoGenerateArrayKeys),
        transactionId: optionalString(input.transactionId),
        skipCrossDatasetReferencesValidation: optionalBoolean(input.skipCrossDatasetReferencesValidation),
        visibility: optionalString(input.visibility),
        dryRun: optionalBoolean(input.dryRun),
        tag: optionalString(input.tag),
      }),
      body: { mutations: input.mutations },
    });
  },
};

export const executors: ProviderExecutors = defineProviderExecutors<SanityContext>({
  service,
  handlers,
  async createContext(context, fetcher): Promise<SanityContext> {
    const credential = await requireApiKeyCredential(context, service);
    return {
      projectId: readProjectId(credential.values.projectId ?? optionalString(credential.metadata.projectId)),
      apiKey: credential.apiKey,
      fetcher,
      signal: context.signal,
    };
  },
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  async baseUrl(context) {
    const credential = await requireApiKeyCredential(context, service);
    return sanityProjectBaseUrl(
      readProjectId(credential.values.projectId ?? optionalString(credential.metadata.projectId)),
    );
  },
  auth: { type: "api_key_authorization", prefix: "Bearer " },
  customizeRequest({ headers }) {
    headers.set("accept", "application/json");
    headers.set("content-type", "application/json");
  },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    return validateSanityCredential(input.apiKey, readProjectId(input.values.projectId), fetcher, signal);
  },
};

async function validateSanityCredential(
  apiKey: string,
  projectId: string,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  await requestSanityJson({
    projectId,
    path: `/projects/${encodeURIComponent(projectId)}/datasets`,
    apiKey,
    fetcher,
    signal,
    phase: "validate",
    management: true,
  });
  return {
    profile: { accountId: projectId, displayName: `Sanity ${projectId}` },
    metadata: {
      projectId,
      apiBaseUrl: sanityProjectBaseUrl(projectId),
      validationEndpoint: `/${sanityManagementApiVersion}/projects/${projectId}/datasets`,
    },
  };
}

async function requestSanityJson(input: SanityRequestInput): Promise<unknown> {
  return runProviderRequest({ label: "Sanity", signal: input.signal }, async (signal) => {
    const baseUrl = input.management
      ? `https://api.sanity.io/${sanityManagementApiVersion}`
      : sanityProjectBaseUrl(input.projectId);
    const url = new URL(`${baseUrl}${input.path}`);
    for (const [key, value] of Object.entries(input.query ?? {})) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }
    const response = await input.fetcher(url, {
      method: input.method ?? "GET",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${input.apiKey}`,
        "content-type": "application/json",
        "user-agent": providerUserAgent,
      },
      body: input.body === undefined ? undefined : JSON.stringify(input.body),
      signal,
    });
    const payload = await readPayload(response);
    if (!response.ok) throw sanityError(response.status, payload, input.phase);
    return payload;
  });
}

async function readPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    if (!response.ok) return { message: text };
    throw new ProviderRequestError(502, "Sanity returned a non-JSON response");
  }
}

function sanityError(status: number, payload: unknown, phase: "validate" | "execute"): ProviderRequestError {
  const record = optionalRecord(payload);
  const nested = optionalRecord(record?.error);
  const message =
    optionalString(record?.message) ??
    optionalString(record?.error) ??
    optionalString(nested?.description) ??
    optionalString(nested?.message) ??
    `Sanity request failed (${status})`;
  if (phase == "validate" && 400 <= status && status < 500) return providerInputError(message);
  if (400 <= status && status < 500 && status != 401 && status != 403) return new ProviderRequestError(status, message);
  return new ProviderRequestError(status || 500, message);
}

function readProjectId(value: unknown): string {
  const projectId = requiredInputString(value, "projectId").toLowerCase();
  const valid = Array.from(projectId).every(
    (character) => ("a" <= character && character <= "z") || ("0" <= character && character <= "9") || character == "-",
  );
  if (!valid || projectId.startsWith("-") || projectId.endsWith("-")) {
    throw new ProviderRequestError(400, "projectId must contain letters, numbers, or hyphens");
  }
  return projectId;
}

function sanityProjectBaseUrl(projectId: string): string {
  return `https://${projectId}.api.sanity.io/${sanityApiVersion}`;
}
