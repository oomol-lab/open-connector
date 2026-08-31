import { optionalRecord, optionalString } from "../../core/cast.ts";
import { ProviderRequestError } from "../provider-runtime.ts";

export const dopplerApiBaseUrl = "https://api.doppler.com";

type DopplerRequestPhase = "validate" | "execute";
type DopplerQueryValue = string | number | boolean | readonly string[] | undefined;

interface DopplerRequestInput {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  path: string;
  query?: Record<string, DopplerQueryValue>;
  body?: Record<string, unknown>;
  headers?: Record<string, string>;
}

export async function dopplerRequest(
  accessToken: string,
  input: DopplerRequestInput,
  fetcher: typeof fetch,
  phase: DopplerRequestPhase,
): Promise<unknown> {
  return (await dopplerRequestWithResponse(accessToken, input, fetcher, phase)).payload;
}

export async function dopplerRequestWithResponse(
  accessToken: string,
  input: DopplerRequestInput,
  fetcher: typeof fetch,
  phase: DopplerRequestPhase,
): Promise<{ response: Response; payload: unknown }> {
  const url = new URL(input.path, dopplerApiBaseUrl);
  for (const [key, value] of Object.entries(input.query ?? {})) {
    if (value === undefined) {
      continue;
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        url.searchParams.append(key, item);
      }
      continue;
    }
    url.searchParams.set(key, String(value));
  }

  let response: Response;
  let payload: unknown;
  try {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${accessToken}`,
      accept: "application/json",
    };
    mergeHeaders(headers, input.headers);
    if (input.body !== undefined) {
      headers["content-type"] = "application/json";
    }

    response = await fetcher(url, {
      method: input.method ?? "GET",
      headers,
      body: input.body === undefined ? undefined : JSON.stringify(input.body),
    });
    payload = await readDopplerPayload(response);
  } catch (error) {
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Doppler request failed: ${error.message}` : "Doppler request failed",
    );
  }

  if (!response.ok) {
    throw createDopplerError(response, payload, phase);
  }

  return { response, payload };
}

export async function readDopplerPayload(response: Response): Promise<unknown> {
  if (response.status === 204) {
    return null;
  }

  const text = await response.text();
  if (text === "") {
    return "";
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

export function createDopplerError(
  response: Response,
  payload: unknown,
  phase: DopplerRequestPhase,
): ProviderRequestError {
  const message = extractDopplerErrorMessage(payload) ?? response.statusText ?? "Doppler request failed";

  if (response.status === 429) {
    return new ProviderRequestError(429, message);
  }

  if (phase === "validate" && (response.status === 401 || response.status === 403)) {
    return new ProviderRequestError(400, message);
  }

  if (phase === "execute" && response.status === 401) {
    return new ProviderRequestError(401, message);
  }

  if (response.status === 400 || response.status === 404) {
    return new ProviderRequestError(400, message);
  }

  if (phase === "execute" && response.status === 403) {
    return new ProviderRequestError(403, message);
  }

  return new ProviderRequestError(response.status >= 500 ? 502 : response.status || 500, message);
}

export function extractDopplerErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim() !== "") {
    return payload;
  }

  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }

  const directMessage =
    optionalString(record.message) ?? optionalString(record.error) ?? optionalString(record.error_message);
  if (directMessage?.trim()) {
    return directMessage.trim();
  }

  if (Array.isArray(record.messages) && record.messages.length > 0) {
    const firstMessage = record.messages.find((item) => typeof item === "string");
    if (typeof firstMessage === "string" && firstMessage.trim() !== "") {
      return firstMessage.trim();
    }
  }

  return undefined;
}

export function readObject(payload: unknown, label: string): Record<string, unknown> {
  const record = optionalRecord(payload);
  if (!record) {
    throw new ProviderRequestError(502, `malformed Doppler response: ${label}`);
  }
  return record;
}

export function readArray(payload: unknown, label: string): unknown[] {
  if (!Array.isArray(payload)) {
    throw new ProviderRequestError(502, `malformed Doppler response: ${label}`);
  }
  return payload;
}

function mergeHeaders(target: Record<string, string>, source?: Record<string, string>): void {
  if (!source) {
    return;
  }

  for (const [key, value] of Object.entries(source)) {
    const matchedKey = Object.keys(target).find((targetKey) => targetKey.toLowerCase() === key.toLowerCase());
    target[matchedKey ?? key] = value;
  }
}
