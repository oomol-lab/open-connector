import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext, ProviderRuntimeHandler } from "../provider-runtime.ts";

import { compactObject, optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import {
  createProviderTimeout,
  isAbortSignalError,
  providerInputError,
  providerUserAgent,
  ProviderRequestError,
  readProviderTextBody,
} from "../provider-runtime.ts";

export const lifxApiBaseUrl = "https://api.lifx.com/v1";

type LifxRequestPhase = "validate" | "execute";

interface LifxRequestInput {
  path: string;
  method: "GET" | "POST" | "PUT";
  apiKey: string;
  fetcher: typeof fetch;
  phase: LifxRequestPhase;
  signal?: AbortSignal;
  body?: Record<string, unknown>;
}

export const lifxActionHandlers: ProviderActionHandlers<"lifx", ProviderRuntimeHandler<ApiKeyProviderContext>> = {
  async list_lights(input, context) {
    const selector = readSelector(input);
    const payload = await requestLifx({
      path: `/lights/${encodeURIComponent(selector)}`,
      method: "GET",
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      signal: context.signal,
      phase: "execute",
    });
    return { lights: readArrayPayload(payload) };
  },

  async set_state(input, context) {
    const selector = readSelector(input);
    const payload = await requestLifx({
      path: `/lights/${encodeURIComponent(selector)}/state`,
      method: "PUT",
      body: compactObject({
        power: input.power,
        color: optionalString(input.color),
        brightness: input.brightness,
        duration: input.duration,
        infrared: input.infrared,
        fast: input.fast,
      }),
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      signal: context.signal,
      phase: "execute",
    });
    return normalizeActionResponse(payload);
  },

  async toggle_power(input, context) {
    const selector = readSelector(input);
    const payload = await requestLifx({
      path: `/lights/${encodeURIComponent(selector)}/toggle`,
      method: "POST",
      body: compactObject({
        duration: input.duration,
      }),
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      signal: context.signal,
      phase: "execute",
    });
    return normalizeActionResponse(payload);
  },

  async list_scenes(_input, context) {
    const payload = await requestLifx({
      path: "/scenes",
      method: "GET",
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      signal: context.signal,
      phase: "execute",
    });
    return { scenes: readArrayPayload(payload) };
  },

  async activate_scene(input, context) {
    const sceneUuid = requiredString(input.sceneUuid, "sceneUuid", providerInputError);
    const payload = await requestLifx({
      path: `/scenes/scene_id:${encodeURIComponent(sceneUuid)}/activate`,
      method: "PUT",
      body: compactObject({
        duration: input.duration,
        ignore: Array.isArray(input.ignore) ? input.ignore : undefined,
        overrides: optionalRecord(input.overrides),
        fast: input.fast,
      }),
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      signal: context.signal,
      phase: "execute",
    });
    return normalizeActionResponse(payload);
  },

  async validate_color(input, context) {
    const color = requiredString(input.color, "color", providerInputError);
    const url = buildLifxUrl("/color");
    url.searchParams.set("string", color);
    return requestLifxUrl({
      url,
      method: "GET",
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      signal: context.signal,
      phase: "execute",
    });
  },

  async turn_effects_off(input, context) {
    const selector = readSelector(input);
    const payload = await requestLifx({
      path: `/lights/${encodeURIComponent(selector)}/effects/off`,
      method: "POST",
      body: compactObject({
        power_off: input.powerOff,
      }),
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      signal: context.signal,
      phase: "execute",
    });
    return normalizeActionResponse(payload);
  },
};

export async function validateLifxCredential(
  apiKey: string,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const payload = await requestLifx({
    path: "/lights/all",
    method: "GET",
    apiKey,
    fetcher,
    signal,
    phase: "validate",
  });
  const lights = Array.isArray(payload) ? payload : [];
  const firstLight = lights.map((item) => optionalRecord(item)).find((item) => item);
  const label = optionalString(firstLight?.label);

  return {
    profile: {
      displayName: label ? `LIFX: ${label}` : "LIFX Access Token",
      grantedScopes: [],
    },
    grantedScopes: [],
    metadata: {
      apiBaseUrl: lifxApiBaseUrl,
      validationEndpoint: "/lights/all",
      lightCount: lights.length,
    },
  };
}

function readSelector(input: Record<string, unknown>): string {
  return optionalString(input.selector) ?? "all";
}

function buildLifxUrl(path: string): URL {
  return new URL(`${lifxApiBaseUrl}${path}`);
}

async function requestLifx(input: LifxRequestInput): Promise<unknown> {
  return requestLifxUrl({
    url: buildLifxUrl(input.path),
    method: input.method,
    body: input.body,
    apiKey: input.apiKey,
    fetcher: input.fetcher,
    signal: input.signal,
    phase: input.phase,
  });
}

async function requestLifxUrl(input: Omit<LifxRequestInput, "path"> & { url: URL }): Promise<unknown> {
  input.signal?.throwIfAborted();
  const timeout = createProviderTimeout(input.signal);
  let response: Response;
  let payload: unknown;
  try {
    response = await input.fetcher(input.url, {
      method: input.method,
      headers: lifxHeaders(input.apiKey, input.body ? { "content-type": "application/json" } : {}),
      body: input.body ? JSON.stringify(input.body) : undefined,
      signal: timeout.signal,
    });
    payload = await readLifxPayload(response);
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    if (timeout.didTimeout()) {
      throw new ProviderRequestError(504, "LIFX request timed out");
    }
    if (isAbortSignalError(input.signal, error)) {
      throw error;
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `LIFX request failed: ${error.message}` : "LIFX request failed",
    );
  } finally {
    timeout.cleanup();
  }

  if (!response.ok) {
    throw createLifxError(response, payload, input.phase);
  }
  if (payload == null && response.status !== 202) {
    throw new ProviderRequestError(502, `LIFX returned an empty response with status ${response.status}`);
  }

  return payload;
}

function lifxHeaders(apiKey: string, extraHeaders: Record<string, string> = {}): Record<string, string> {
  return {
    accept: "application/json",
    authorization: `Bearer ${apiKey}`,
    "user-agent": providerUserAgent,
    ...extraHeaders,
  };
}

async function readLifxPayload(response: Response): Promise<unknown> {
  const text = await readProviderTextBody(response, "LIFX response");
  if (!text.trim()) {
    return null;
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    try {
      return JSON.parse(text) as unknown;
    } catch (error) {
      if (response.ok) {
        throw new ProviderRequestError(502, "LIFX returned invalid JSON", error);
      }
      return text;
    }
  }
  return text;
}

function readArrayPayload(payload: unknown): unknown[] {
  if (!Array.isArray(payload)) {
    throw new ProviderRequestError(502, "LIFX response was not an array");
  }
  return payload;
}

function normalizeActionResponse(payload: unknown): Record<string, unknown> {
  if (payload == null || payload === "") {
    return { accepted: true, results: [] };
  }

  const objectPayload = optionalRecord(payload);
  if (!objectPayload) {
    throw new ProviderRequestError(502, "LIFX response was not an object");
  }
  if (!Array.isArray(objectPayload.results)) {
    throw new ProviderRequestError(502, "LIFX response did not contain a results array", payload);
  }
  return {
    accepted: false,
    results: objectPayload.results,
  };
}

function createLifxError(response: Response, payload: unknown, phase: LifxRequestPhase): ProviderRequestError {
  const message = readLifxErrorMessage(payload) ?? `LIFX request failed with ${response.status}`;
  if (response.status === 401 || response.status === 403) {
    return new ProviderRequestError(phase === "validate" ? 400 : response.status, message, payload);
  }
  if (response.status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if (response.status >= 400 && response.status < 500) {
    return new ProviderRequestError(response.status, message, payload);
  }
  return new ProviderRequestError(response.status || 502, message, payload);
}

function readLifxErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim()) {
    return payload.trim();
  }
  const objectPayload = optionalRecord(payload);
  if (!objectPayload) {
    return undefined;
  }

  const direct = optionalString(objectPayload.error) ?? optionalString(objectPayload.message);
  if (direct) {
    return direct;
  }

  if (Array.isArray(objectPayload.errors)) {
    const firstError = objectPayload.errors[0];
    if (typeof firstError === "string") {
      return firstError;
    }
    return optionalString(optionalRecord(firstError)?.message);
  }
  return undefined;
}
