import type { ApiKeyProviderContext } from "../provider-executors.ts";

import { setTimeout as delay } from "node:timers/promises";
import { optionalString } from "../../core/cast.ts";
import {
  ProviderRequestError,
  providerResponseError,
  readProviderErrorTextBody,
  readProviderJsonBody,
  requiredResponseRecord,
  runProviderRequest,
} from "../provider-runtime.ts";

export const baobiaoBaseUrl = "https://gate.gov-bid.com/outer-gateway";
const label = "Baobiao";
const successSubCode = "0000000000";
// Gateway sub-code for a missing or unknown key, observed live; the public docs list only the success code.
const invalidKeySubCode = "0100590001";
// Gateway sub-code, sent with code -1, for an endpoint the account has not enabled or has no quota or balance left for.
const endpointNotGrantedSubCode = "0100590005";
const searchQueryPollMs = 1_500;
const searchQueryBudgetMs = 25_000;

interface BaobiaoRequest {
  path: string;
  body: Record<string, unknown>;
  /** Send the body as multipart form fields instead of JSON. */
  form?: boolean;
}

/** POST one gateway endpoint and return the envelope after checking its business status. */
export async function requestBaobiao(
  context: ApiKeyProviderContext,
  request: BaobiaoRequest,
): Promise<Record<string, unknown>> {
  const url = new URL(`${baobiaoBaseUrl}${request.path}`);
  url.searchParams.set("key", context.apiKey);
  return runProviderRequest({ signal: context.signal, label }, async (signal) => {
    const response = await context.fetcher(url, {
      method: "POST",
      headers: request.form
        ? { accept: "application/json" }
        : { accept: "application/json", "content-type": "application/json" },
      body: request.form ? formBody(request.body) : JSON.stringify(request.body),
      signal,
    });
    if (!response.ok) {
      const text = await readProviderErrorTextBody(response, `${label} error response`, signal);
      throw new ProviderRequestError(response.status, text || `${label} request failed with HTTP ${response.status}`);
    }
    const envelope = requiredResponseRecord(
      await readProviderJsonBody(response, { emptyBody: {}, invalidJsonMessage: `${label} returned invalid JSON` }),
      `${label} response`,
    );
    assertBaobiaoSuccess(envelope);
    return envelope;
  });
}

/**
 * Submit a plain-language query and keep resubmitting it, as the gateway expects,
 * until the rewrite finishes or the wait budget runs out. The shared request timeout caps the whole wait.
 */
export async function pollBaobiaoSearchQuery(
  context: ApiKeyProviderContext,
  path: string,
  userQuery: string,
): Promise<unknown> {
  return runProviderRequest({ signal: context.signal, label }, async (signal) => {
    const deadline = Date.now() + searchQueryBudgetMs;
    for (;;) {
      const startedAt = Date.now();
      const envelope = await requestBaobiao({ ...context, signal }, { path, body: { userQuery } });
      const requestMs = Date.now() - startedAt;
      const data = requiredResponseRecord(envelope.data, `${label} search query response`);
      if (data.status === "failed") {
        throw providerResponseError(optionalString(data.errorMsg) ?? `${label} could not build a search query`);
      }
      // Stop early enough that one more submission, as slow as the last, still fits in the budget.
      if (data.status === "completed" || Date.now() + searchQueryPollMs + requestMs >= deadline) {
        return data;
      }
      await delay(searchQueryPollMs, undefined, { signal });
    }
  });
}

/** Whether an error is the gateway rejecting the API key itself. */
export function isBaobiaoInvalidKeyError(error: unknown): boolean {
  return error instanceof ProviderRequestError && error.status === 401;
}

function assertBaobiaoSuccess(envelope: Record<string, unknown>): void {
  // Most endpoints report code 200; the source-URL endpoint may report 1 and the detail endpoints use state 1.
  const succeeded = envelope.code === 200 || envelope.code === 1 || envelope.state === 1;
  if (succeeded && (optionalString(envelope.subCode) ?? successSubCode) === successSubCode) {
    return;
  }
  const message = optionalString(envelope.subMsg) ?? optionalString(envelope.msg) ?? `${label} request failed`;
  throw new ProviderRequestError(baobiaoErrorStatus(envelope), message, envelope);
}

function baobiaoErrorStatus(envelope: Record<string, unknown>): number {
  if (envelope.subCode === invalidKeySubCode) return 401;
  if (envelope.subCode === endpointNotGrantedSubCode) return 403;
  const code = envelope.code;
  if (code === 403 || code === 429) return code;
  if (typeof code === "number" && code >= 400 && code < 500) return 400;
  return 502;
}

function formBody(fields: Record<string, unknown>): FormData {
  const body = new FormData();
  for (const [name, value] of Object.entries(fields)) {
    if (value !== undefined && value !== null) body.set(name, String(value));
  }
  return body;
}
