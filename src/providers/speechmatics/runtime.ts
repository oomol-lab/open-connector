import type { CredentialValidationResult } from "../../core/types.ts";
import type { ApiKeyProviderContext, ProviderFetch } from "../provider-runtime.ts";

import { optionalRecord, optionalString } from "../../core/cast.ts";
import { ProviderRequestError, providerUserAgent, readProviderTextBody } from "../provider-runtime.ts";

const speechmaticsManagementApiBaseUrl = "https://mp.api.speechmatics.com/v1";
const speechmaticsProjectsPath = "/projects";
const speechmaticsDiscoveryPath = "/v1/discovery/features";

type SpeechmaticsRequestPhase = "validate" | "execute";
type SpeechmaticsBatchRegion = keyof typeof speechmaticsBatchHosts;
type SpeechmaticsProcessingMode = "batch" | "realtime";
type SpeechmaticsActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

interface SpeechmaticsRequestOptions {
  url: URL;
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">;
  phase: SpeechmaticsRequestPhase;
  authenticated: boolean;
}

interface SpeechmaticsDeployment {
  mode: SpeechmaticsProcessingMode;
  region: string;
  location: string;
  customerType: "all" | "enterprise";
  endpoint: string;
  protocol: "https" | "wss";
  apiVersion: string;
}

const speechmaticsBatchHosts = {
  eu1: "eu1.asr.api.speechmatics.com",
  eu2: "eu2.asr.api.speechmatics.com",
  us1: "us1.asr.api.speechmatics.com",
  us2: "us2.asr.api.speechmatics.com",
  au1: "au1.asr.api.speechmatics.com",
} as const;

const speechmaticsDeployments: readonly SpeechmaticsDeployment[] = [
  {
    mode: "batch",
    region: "EU1",
    location: "Europe",
    customerType: "all",
    endpoint: speechmaticsBatchHosts.eu1,
    protocol: "https",
    apiVersion: "v2",
  },
  {
    mode: "batch",
    region: "EU2",
    location: "Europe",
    customerType: "enterprise",
    endpoint: speechmaticsBatchHosts.eu2,
    protocol: "https",
    apiVersion: "v2",
  },
  {
    mode: "batch",
    region: "US1",
    location: "USA",
    customerType: "all",
    endpoint: speechmaticsBatchHosts.us1,
    protocol: "https",
    apiVersion: "v2",
  },
  {
    mode: "batch",
    region: "US2",
    location: "USA",
    customerType: "enterprise",
    endpoint: speechmaticsBatchHosts.us2,
    protocol: "https",
    apiVersion: "v2",
  },
  {
    mode: "batch",
    region: "AU1",
    location: "Australia",
    customerType: "all",
    endpoint: speechmaticsBatchHosts.au1,
    protocol: "https",
    apiVersion: "v2",
  },
  {
    mode: "realtime",
    region: "EU1",
    location: "Europe",
    customerType: "all",
    endpoint: "eu.rt.speechmatics.com",
    protocol: "wss",
    apiVersion: "v2",
  },
  {
    mode: "realtime",
    region: "US1",
    location: "USA",
    customerType: "all",
    endpoint: "us.rt.speechmatics.com",
    protocol: "wss",
    apiVersion: "v2",
  },
];

export const speechmaticsActionHandlers: Record<string, SpeechmaticsActionHandler> = {
  async list_projects(_input, context): Promise<unknown> {
    const payload = await speechmaticsRequestJson({
      url: new URL(`${speechmaticsManagementApiBaseUrl}${speechmaticsProjectsPath}`),
      context,
      phase: "execute",
      authenticated: true,
    });

    return { projects: readProjects(payload) };
  },
  async get_service_capabilities(input, context): Promise<unknown> {
    const region = readBatchRegion(input.region);
    const endpoint = new URL(`https://${speechmaticsBatchHosts[region]}${speechmaticsDiscoveryPath}`);
    const payload = await speechmaticsRequestJson({
      url: endpoint,
      context,
      phase: "execute",
      authenticated: false,
    });

    return {
      region,
      endpoint: endpoint.toString(),
      capabilities: requireSpeechmaticsObject(payload, "Discovery API response"),
    };
  },
  async list_deployments(input): Promise<unknown> {
    const mode = optionalString(input.mode) as SpeechmaticsProcessingMode | undefined;
    return {
      deployments: mode
        ? speechmaticsDeployments.filter((deployment) => deployment.mode === mode)
        : [...speechmaticsDeployments],
    };
  },
};

export async function validateSpeechmaticsCredential(
  managementToken: string,
  fetcher: ProviderFetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  await speechmaticsRequestJson({
    url: new URL(`${speechmaticsManagementApiBaseUrl}${speechmaticsProjectsPath}`),
    context: { apiKey: managementToken, fetcher, signal },
    phase: "validate",
    authenticated: true,
  });

  return {
    profile: {
      displayName: "Speechmatics Management Token",
    },
    grantedScopes: ["View projects"],
    metadata: {
      apiBaseUrl: speechmaticsManagementApiBaseUrl,
      validationEndpoint: speechmaticsProjectsPath,
    },
  };
}

async function speechmaticsRequestJson(input: SpeechmaticsRequestOptions): Promise<unknown> {
  let response: Response;
  try {
    response = await input.context.fetcher(input.url, {
      method: "GET",
      headers: speechmaticsHeaders(input.authenticated ? input.context.apiKey : undefined),
      signal: input.context.signal,
    });
  } catch (error) {
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Speechmatics request failed: ${error.message}` : "Speechmatics request failed",
    );
  }

  const payload = await readSpeechmaticsPayload(response);
  if (!response.ok) {
    throw createSpeechmaticsError(response, payload, input.phase);
  }

  return payload;
}

function speechmaticsHeaders(token?: string): Record<string, string> {
  const headers: Record<string, string> = {
    accept: "application/json",
    "user-agent": providerUserAgent,
  };
  if (token) {
    headers.authorization = `Bearer ${token}`;
  }
  return headers;
}

async function readSpeechmaticsPayload(response: Response): Promise<unknown> {
  const text = await readProviderTextBody(response, "Speechmatics response");
  if (!text.trim()) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function createSpeechmaticsError(
  response: Response,
  payload: unknown,
  phase: SpeechmaticsRequestPhase,
): ProviderRequestError {
  const message =
    extractSpeechmaticsErrorMessage(payload) ??
    response.statusText ??
    `Speechmatics request failed with status ${response.status}`;

  if (phase === "validate" && (response.status === 401 || response.status === 403)) {
    return new ProviderRequestError(400, message, payload);
  }
  if (response.status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if (response.status >= 400 && response.status < 500) {
    return new ProviderRequestError(response.status, message, payload);
  }
  return new ProviderRequestError(response.status || 502, message, payload);
}

function extractSpeechmaticsErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim()) {
    return payload.trim();
  }

  const object = optionalRecord(payload);
  if (!object) {
    return undefined;
  }

  return optionalString(object.detail) ?? optionalString(object.error) ?? optionalString(object.message);
}

function readProjects(payload: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(payload)) {
    throw new ProviderRequestError(502, "Speechmatics projects response must be an array");
  }

  return payload.map((project) => {
    const object = requireSpeechmaticsObject(project, "project");
    if (!Number.isInteger(object.project_id)) {
      throw new ProviderRequestError(502, "Speechmatics project_id must be an integer");
    }
    return object;
  });
}

function requireSpeechmaticsObject(value: unknown, label: string): Record<string, unknown> {
  const object = optionalRecord(value);
  if (!object) {
    throw new ProviderRequestError(502, `Speechmatics ${label} must be an object`);
  }
  return object;
}

function readBatchRegion(value: unknown): SpeechmaticsBatchRegion {
  const region = optionalString(value) ?? "eu1";
  if (region in speechmaticsBatchHosts) {
    return region as SpeechmaticsBatchRegion;
  }
  throw new ProviderRequestError(400, `Unsupported Speechmatics region: ${region}`);
}
