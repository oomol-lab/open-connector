import { optionalInteger, optionalRecord, optionalString } from "../../core/cast.ts";
import { jsonObject } from "../../core/request.ts";
import { createProviderTimeout, ProviderRequestError, providerUserAgent } from "../provider-runtime.ts";

const coderpadApiBaseUrl = "https://app.coderpad.io";

type CoderpadRequestPhase = "validate" | "execute";

interface CoderpadRequestInput {
  apiKey: string;
  path: string;
  fetcher: typeof fetch;
  phase: CoderpadRequestPhase;
  method?: string;
  query?: Record<string, unknown>;
  form?: Record<string, unknown>;
}

export async function executeCoderpadAction(
  actionName: string,
  input: Record<string, unknown>,
  apiKey: string,
  fetcher: typeof fetch,
): Promise<unknown> {
  switch (actionName) {
    case "list_pads":
      return requestCoderpadJson({
        apiKey,
        path: "/api/pads/",
        query: buildPaginationQuery(input),
        fetcher,
        phase: "execute",
      });
    case "get_pad":
      return requestCoderpadJson({
        apiKey,
        path: `/api/pads/${encodeURIComponent(requireString(input.padId, "padId"))}`,
        fetcher,
        phase: "execute",
      });
    case "create_pad":
      return requestCoderpadJson({
        apiKey,
        path: "/api/pads/",
        method: "POST",
        form: jsonObject({
          title: optionalString(input.title),
          language: optionalString(input.language),
          contents: optionalString(input.contents),
          notes: optionalString(input.notes),
        }),
        fetcher,
        phase: "execute",
      });
    case "list_pad_events":
      return requestCoderpadJson({
        apiKey,
        path: `/api/pads/${encodeURIComponent(requireString(input.padId, "padId"))}/events`,
        query: buildPaginationQuery(input),
        fetcher,
        phase: "execute",
      });
    case "list_questions":
      return requestCoderpadJson({
        apiKey,
        path: "/api/questions/",
        query: buildPaginationQuery(input),
        fetcher,
        phase: "execute",
      });
    case "get_question":
      return requestCoderpadJson({
        apiKey,
        path: `/api/questions/${requireInteger(input.questionId, "questionId")}`,
        fetcher,
        phase: "execute",
      });
    case "get_organization":
      return requestCoderpadJson({
        apiKey,
        path: "/api/organization",
        fetcher,
        phase: "execute",
      });
    case "get_organization_stats": {
      const startTime = optionalString(input.startTime);
      const endTime = optionalString(input.endTime);
      if ((startTime == null) !== (endTime == null)) {
        throw new ProviderRequestError(400, "startTime and endTime must be provided together");
      }
      return requestCoderpadJson({
        apiKey,
        path: "/api/organization/stats",
        query: jsonObject({ start_time: startTime, end_time: endTime }),
        fetcher,
        phase: "execute",
      });
    }
  }
}

export async function validateCoderpadCredential(
  apiKey: string,
  fetcher: typeof fetch,
): Promise<{ accountLabel: string; providerScopes: string[]; providerMetadata: Record<string, unknown> }> {
  const payload = await requestCoderpadJson({
    apiKey,
    path: "/api/organization",
    fetcher,
    phase: "validate",
  });
  const organization = optionalRecord(payload);
  const organizationName = optionalString(organization?.organization_name);
  if (organizationName == null) {
    throw new ProviderRequestError(502, "CoderPad organization response did not include organization_name");
  }
  return {
    accountLabel: organizationName,
    providerScopes: [],
    providerMetadata: {
      apiBaseUrl: coderpadApiBaseUrl,
      validationEndpoint: "/api/organization",
    },
  };
}

function buildPaginationQuery(input: Record<string, unknown>) {
  const page = optionalInteger(input.page);
  return jsonObject({
    sort: optionalString(input.sort),
    page: page == null ? undefined : String(page),
  });
}

async function requestCoderpadJson(input: CoderpadRequestInput): Promise<unknown> {
  const timeoutHandle = createProviderTimeout(undefined);
  const url = new URL(input.path, coderpadApiBaseUrl);
  for (const [name, value] of Object.entries(input.query ?? {})) {
    if (value != null) url.searchParams.set(name, String(value));
  }
  const form = new FormData();
  for (const [name, value] of Object.entries(input.form ?? {})) {
    if (value != null) form.set(name, String(value));
  }

  try {
    const headers = new Headers({
      accept: "application/json",
      authorization: `Token token="${input.apiKey}"`,
      "user-agent": providerUserAgent,
    });
    const response = await input.fetcher(url, {
      method: input.method ?? "GET",
      headers,
      body: input.form == null ? undefined : form,
      signal: timeoutHandle.signal,
    });
    const payload = await readCoderpadPayload(response);
    if (!response.ok) throw createCoderpadError(response, payload, input.phase);
    assertCoderpadSuccess(payload, input.phase);
    return payload;
  } catch (error) {
    if (error instanceof ProviderRequestError) throw error;
    if (timeoutHandle.didTimeout() || isAbortError(error)) {
      throw new ProviderRequestError(504, "CoderPad request timed out");
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `CoderPad request failed: ${error.message}` : "CoderPad request failed",
    );
  } finally {
    timeoutHandle.cleanup();
  }
}

function assertCoderpadSuccess(payload: unknown, phase: CoderpadRequestPhase) {
  const record = optionalRecord(payload);
  const status = optionalString(record?.status);
  if (status === "OK") return;

  const message =
    optionalString(record?.message) ??
    (status == null ? "CoderPad response did not include status" : `CoderPad returned ${status}`);
  throw new ProviderRequestError(phase === "validate" ? 400 : 502, message);
}

async function readCoderpadPayload(response: Response) {
  const text = await response.text();
  if (text.trim() === "") return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "CoderPad returned invalid JSON");
  }
}

function createCoderpadError(response: Response, payload: unknown, phase: CoderpadRequestPhase) {
  const record = optionalRecord(payload);
  const message = optionalString(record?.message) ?? `CoderPad request failed with HTTP ${response.status}`;
  if (response.status === 401 || response.status === 403) {
    return new ProviderRequestError(phase === "validate" ? 400 : response.status, message);
  }
  if (response.status === 429) return new ProviderRequestError(429, message);
  if (response.status === 400 || response.status === 404) {
    return new ProviderRequestError(400, message, response.status);
  }
  return new ProviderRequestError(response.status, message);
}

function requireString(value: unknown, fieldName: string) {
  const parsed = optionalString(value);
  if (parsed == null) throw new ProviderRequestError(400, `${fieldName} is required`);
  return parsed;
}

function requireInteger(value: unknown, fieldName: string) {
  const parsed = optionalInteger(value);
  if (parsed == null) throw new ProviderRequestError(400, `${fieldName} is required`);
  return parsed;
}

function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError";
}

export { coderpadApiBaseUrl };
