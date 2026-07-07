import type { CredentialValidationResult, ExecutionContext, ProviderExecutors } from "../../core/types.ts";
import type { PendoActionName } from "./actions.ts";

import { compactObject, optionalBoolean, optionalRecord, optionalString, stringArray } from "../../core/cast.ts";
import {
  defineProviderExecutors,
  ProviderRequestError,
  providerUserAgent,
  requireApiKeyCredential,
} from "../provider-runtime.ts";

const pendoRegions: Record<PendoRegion, string> = {
  us: "https://app.pendo.io",
  eu: "https://app.eu.pendo.io",
  us1: "https://us1.app.pendo.io",
  japan: "https://app.jpn.pendo.io",
  australia: "https://app.au.pendo.io",
};

type PendoRegion = "us" | "eu" | "us1" | "japan" | "australia";
type PendoPhase = "validate" | "execute";
type PendoActionHandler = (input: Record<string, unknown>, context: PendoActionContext) => Promise<unknown>;

interface PendoActionContext {
  apiKey: string;
  baseUrl: string;
  fetcher: typeof fetch;
}

interface PendoRequestInput extends PendoActionContext {
  phase: PendoPhase;
  searchParams?: URLSearchParams;
}

export const pendoActionHandlers: Record<PendoActionName, PendoActionHandler> = {
  async identify(_input, context) {
    const raw = await pendoRequest("/api/v1/token/verify", { ...context, phase: "execute" });
    const object = optionalRecord(raw) ?? {};
    return {
      valid: true,
      canWrite: pickOptionalBoolean(object, "canWrite", "can_write", "write", "writeAccess") ?? null,
      raw,
    };
  },
  async list_pages(input, context) {
    const payload = await pendoRequest("/api/v1/page", {
      ...context,
      phase: "execute",
      searchParams: buildListSearchParams(input),
    });
    return { pages: readArrayPayload(payload, "pages") };
  },
  async get_pages(input, context) {
    const payload = await pendoRequest("/api/v1/page", {
      ...context,
      phase: "execute",
      searchParams: idsSearchParams(input),
    });
    return { pages: readArrayPayload(payload, "pages") };
  },
  async list_features(input, context) {
    const payload = await pendoRequest("/api/v1/feature", {
      ...context,
      phase: "execute",
      searchParams: buildListSearchParams(input),
    });
    return { features: readArrayPayload(payload, "features") };
  },
  async get_features(input, context) {
    const payload = await pendoRequest("/api/v1/feature", {
      ...context,
      phase: "execute",
      searchParams: idsSearchParams(input),
    });
    return { features: readArrayPayload(payload, "features") };
  },
};

export const executors: ProviderExecutors = defineProviderExecutors<PendoActionContext>({
  service: "pendo",
  handlers: pendoActionHandlers,
  async createContext(context, fetcher): Promise<PendoActionContext> {
    const credential = await requireApiKeyCredential(context, "pendo");
    return {
      apiKey: credential.apiKey,
      baseUrl: readBaseUrl(credential.metadata, credential.values.region),
      fetcher,
    };
  },
});

export async function pendoApiBaseUrl(context: ExecutionContext): Promise<string> {
  const credential = await requireApiKeyCredential(context, "pendo");
  return readBaseUrl(credential.metadata, credential.values.region);
}

export async function validatePendoCredential(
  input: Record<string, string>,
  fetcher: typeof fetch,
): Promise<CredentialValidationResult> {
  const region = normalizePendoRegion(input.region);
  const baseUrl = pendoRegions[region];
  const verification = await pendoRequest("/api/v1/token/verify", {
    apiKey: input.apiKey,
    baseUrl,
    fetcher,
    phase: "validate",
  });
  const raw = optionalRecord(verification) ?? {};

  return {
    profile: {
      accountId: `pendo-${region}`,
      displayName: `Pendo ${region.toUpperCase()} Integration Key`,
      grantedScopes: readProviderScopes(raw),
    },
    metadata: compactObject({
      apiBaseUrl: baseUrl,
      region,
      validationEndpoint: "/api/v1/token/verify",
      canWrite: pickOptionalBoolean(raw, "canWrite", "can_write", "write", "writeAccess"),
    }),
  };
}

async function pendoRequest(path: string, input: PendoRequestInput): Promise<unknown> {
  const url = new URL(path, input.baseUrl);
  for (const [key, value] of input.searchParams?.entries() ?? []) {
    url.searchParams.append(key, value);
  }

  let response: Response;
  let payload: unknown;
  try {
    response = await input.fetcher(url, {
      method: "GET",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        "user-agent": providerUserAgent,
        "x-pendo-integration-key": input.apiKey,
      },
    });
    payload = await readPendoPayload(response);
  } catch (error) {
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Pendo request failed: ${error.message}` : "Pendo request failed",
    );
  }

  if (!response.ok) {
    throw createPendoError(response.status, payload, input.phase);
  }

  return payload;
}

async function readPendoPayload(response: Response): Promise<unknown> {
  const text = await response.text().catch(() => "");
  if (!text.trim()) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function createPendoError(status: number, payload: unknown, phase: PendoPhase): ProviderRequestError {
  const message = readPendoErrorMessage(payload) ?? `Pendo request failed with HTTP ${status}`;
  if (status === 401 || status === 403) {
    return new ProviderRequestError(phase === "validate" ? 400 : 401, message, payload);
  }
  return new ProviderRequestError(status >= 500 ? 502 : status, message, payload);
}

function readPendoErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim()) {
    return payload.trim();
  }

  const object = optionalRecord(payload);
  if (!object) {
    return undefined;
  }

  return (
    optionalString(object.message) ??
    optionalString(object.error) ??
    optionalString(object.errorMessage) ??
    optionalString(object.details)
  );
}

function normalizePendoRegion(value: unknown): PendoRegion {
  if (value == null || value === "") {
    return "us";
  }
  const normalized = optionalString(value)?.toLowerCase();
  if (!normalized) {
    throw new ProviderRequestError(400, "Pendo region must be a string");
  }

  for (const [region, baseUrl] of Object.entries(pendoRegions)) {
    if (normalized === region || normalized === baseUrl) {
      return region as PendoRegion;
    }
  }

  throw new ProviderRequestError(400, "Pendo region must be one of us, eu, us1, japan, or australia");
}

function readBaseUrl(providerMetadata: Record<string, unknown>, regionValue: unknown): string {
  const baseUrl = optionalString(providerMetadata.apiBaseUrl);
  if (baseUrl && Object.values(pendoRegions).includes(baseUrl)) {
    return baseUrl;
  }

  return pendoRegions[normalizePendoRegion(providerMetadata.region ?? regionValue)];
}

function buildListSearchParams(input: Record<string, unknown>): URLSearchParams {
  const params = new URLSearchParams();
  const appId = optionalString(input.appId);
  if (appId) {
    params.set("appId", appId);
  }
  if (optionalBoolean(input.expandAllApps) === true) {
    params.set("expand", "*");
  }
  return params;
}

function idsSearchParams(input: Record<string, unknown>): URLSearchParams {
  const params = new URLSearchParams();
  params.set("id", stringArray(input.ids, "ids", (message) => new ProviderRequestError(400, message)).join(","));
  return params;
}

function readArrayPayload(payload: unknown, fieldName: string): unknown[] {
  if (Array.isArray(payload)) {
    return payload;
  }
  if (payload == null) {
    return [];
  }
  throw new ProviderRequestError(502, `Pendo ${fieldName} response was not an array`);
}

function pickOptionalBoolean(object: Record<string, unknown>, ...keys: string[]): boolean | undefined {
  for (const key of keys) {
    const value = optionalBoolean(object[key]);
    if (value !== undefined) {
      return value;
    }
  }
  return undefined;
}

function readProviderScopes(object: Record<string, unknown>): string[] {
  const canWrite = pickOptionalBoolean(object, "canWrite", "can_write", "write", "writeAccess");
  if (canWrite === true) {
    return ["read", "write"];
  }
  if (canWrite === false) {
    return ["read"];
  }
  return [];
}
