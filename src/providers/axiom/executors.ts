import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";
import type { AxiomActionName } from "./actions.ts";

import { compactObject, optionalRecord, optionalString, requiredRecord, requiredString } from "../../core/cast.ts";
import {
  defineProviderExecutors,
  ProviderRequestError,
  providerUserAgent,
  requireApiKeyCredential,
  setSearchParams,
} from "../provider-runtime.ts";

const service = "axiom";
const axiomApiBaseUrl = "https://api.axiom.co";

type AxiomPhase = "validate" | "execute";
type AxiomMethod = "GET" | "POST" | "DELETE";
type AxiomActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

export const axiomActionHandlers: Record<AxiomActionName, AxiomActionHandler> = {
  async list_datasets(_input, context) {
    return {
      datasets: await requestAxiomJson({
        context,
        path: "/v2/datasets",
        phase: "execute",
      }),
    };
  },
  async get_dataset(input, context) {
    const payload = await requestAxiomJson({
      context,
      path: `/v2/datasets/${encodeURIComponent(requiredString(input.dataset_id, "dataset_id"))}`,
      phase: "execute",
    });

    return {
      dataset: requiredRecord(payload, "Axiom dataset response", providerPayloadError),
    };
  },
  async create_dataset(input, context) {
    const payload = await requestAxiomJson({
      context,
      path: "/v2/datasets",
      method: "POST",
      query: compactObject({
        referrer: optionalString(input.referrer),
      }),
      body: compactObject({
        name: requiredString(input.name, "name"),
        description: optionalString(input.description),
        edgeDeployment: optionalString(input.edgeDeployment),
        kind: optionalString(input.kind),
        retentionDays: input.retentionDays,
        useRetentionPeriod: input.useRetentionPeriod,
      }),
      phase: "execute",
    });

    return {
      dataset: requiredRecord(payload, "Axiom create dataset response", providerPayloadError),
    };
  },
  async delete_dataset(input, context) {
    await requestAxiomJson({
      context,
      path: `/v2/datasets/${encodeURIComponent(requiredString(input.dataset_id, "dataset_id"))}`,
      method: "DELETE",
      phase: "execute",
    });

    return {
      deleted: true,
    };
  },
  async run_apl_query(input, context) {
    const payload = await requestAxiomJson({
      context,
      path: "/v1/datasets/_apl",
      method: "POST",
      query: compactObject({
        format: optionalString(input.format) ?? "tabular",
        nocache: typeof input.nocache === "boolean" ? String(input.nocache) : undefined,
        saveAsKind: optionalString(input.saveAsKind),
        dataset_name: optionalString(input.dataset_name),
      }),
      body: compactObject({
        apl: requiredString(input.apl, "apl"),
        cursor: optionalString(input.cursor),
        endTime: optionalString(input.endTime),
        includeCursor: input.includeCursor,
        queryOptions: optionalRecord(input.queryOptions),
        startTime: optionalString(input.startTime),
        variables: optionalRecord(input.variables),
      }),
      phase: "execute",
    });
    const result = requiredRecord(payload, "Axiom APL query response", providerPayloadError);

    return {
      result,
      datasetNames: readStringArray(result.datasetNames, "Axiom query datasetNames"),
      format: optionalString(result.format) ?? "",
      status: requiredRecord(result.status, "Axiom query status", providerPayloadError),
    };
  },
};

export const executors: ProviderExecutors = defineProviderExecutors<ApiKeyProviderContext>({
  service,
  handlers: axiomActionHandlers,
  async createContext(context, fetcher): Promise<ApiKeyProviderContext> {
    const credential = await requireApiKeyCredential(context, service);
    return {
      apiKey: credential.apiKey,
      fetcher,
      signal: context.signal,
      transitFiles: context.transitFiles,
    };
  },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const payload = await requestAxiomJson({
      context: {
        apiKey: input.apiKey,
        fetcher,
        signal,
      },
      path: "/v2/datasets",
      phase: "validate",
    });
    if (!Array.isArray(payload)) {
      throw new ProviderRequestError(502, "Axiom datasets response must be an array");
    }
    const firstDataset = optionalRecord(payload[0]);

    return {
      profile: {
        displayName: "Axiom API Token",
      },
      grantedScopes: [],
      metadata: compactObject({
        apiBaseUrl: axiomApiBaseUrl,
        validationEndpoint: "/v2/datasets",
        datasetCount: payload.length,
        firstDatasetId: optionalString(firstDataset?.id),
        firstDatasetName: optionalString(firstDataset?.name),
      }),
    };
  },
};

async function requestAxiomJson(input: {
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">;
  path: string;
  phase: AxiomPhase;
  method?: AxiomMethod;
  query?: Record<string, string | undefined>;
  body?: Record<string, unknown>;
}): Promise<unknown> {
  let response: Response;
  try {
    response = await input.context.fetcher(buildAxiomUrl(input.path, input.query), {
      method: input.method ?? "GET",
      headers: buildAxiomHeaders(input.context.apiKey, input.body !== undefined),
      body: input.body === undefined ? undefined : JSON.stringify(input.body),
      signal: input.context.signal,
    });
  } catch (error) {
    throw new ProviderRequestError(
      isAbortError(error) ? 504 : 502,
      error instanceof Error ? `Axiom request failed: ${error.message}` : "Axiom request failed",
    );
  }

  if (!response.ok) {
    const payload = await readAxiomErrorPayload(response);
    throw createAxiomError(response.status, payload, input.phase);
  }

  return readAxiomPayload(response);
}

function buildAxiomUrl(path: string, query?: Record<string, string | undefined>): URL {
  const normalizedPath = path.startsWith("/") ? path.slice(1) : path;
  const url = new URL(normalizedPath, `${axiomApiBaseUrl}/`);
  if (query) {
    setSearchParams(url, query);
  }
  return url;
}

function buildAxiomHeaders(apiKey: string, hasBody: boolean): Headers {
  const headers = new Headers({
    accept: "application/json",
    authorization: `Bearer ${apiKey}`,
    "user-agent": providerUserAgent,
  });
  if (hasBody) {
    headers.set("content-type", "application/json");
  }
  return headers;
}

async function readAxiomPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (text.trim() === "") {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "Axiom returned invalid JSON");
  }
}

async function readAxiomErrorPayload(response: Response): Promise<unknown> {
  try {
    return await readAxiomPayload(response);
  } catch {
    return undefined;
  }
}

function createAxiomError(status: number, payload: unknown, phase: AxiomPhase): ProviderRequestError {
  const message = extractAxiomErrorMessage(payload) ?? `Axiom request failed with status ${status}`;

  if (status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if (phase === "validate" && status >= 400 && status < 500) {
    return new ProviderRequestError(400, message, payload);
  }
  if (phase === "execute" && (status === 401 || status === 403)) {
    return new ProviderRequestError(status, message, payload);
  }
  if (phase === "execute" && status >= 400 && status < 500) {
    return new ProviderRequestError(status, message, payload);
  }

  return new ProviderRequestError(status || 500, message, payload);
}

function extractAxiomErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim()) {
    return payload;
  }

  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }

  return optionalString(record.message) ?? optionalString(record.error) ?? formatAxiomErrorCode(record.code);
}

function formatAxiomErrorCode(value: unknown): string | undefined {
  const code = optionalString(value);
  return code ? `Axiom error: ${code}` : undefined;
}

function readStringArray(value: unknown, label: string): string[] {
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(502, `${label} must be an array`);
  }
  if (!value.every((item) => typeof item === "string")) {
    throw new ProviderRequestError(502, `${label} must be an array of strings`);
  }
  return value;
}

function providerPayloadError(message: string): ProviderRequestError {
  return new ProviderRequestError(502, message);
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}
