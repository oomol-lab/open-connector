import { optionalRecord, optionalString } from "../../core/cast.ts";
import {
  ProviderRequestError,
  providerUserAgent,
  requiredResponseRecord,
  runProviderRequest,
} from "../provider-runtime.ts";

export interface FutunnActionInput {
  actionName: string;
  input: Record<string, unknown>;
  accessToken: string;
  signal?: AbortSignal;
}

export const futunnApiBaseUrl = "https://webapi.futunn.com";

export async function readFutunnResponse(response: Response, allowNoData = false): Promise<Record<string, unknown>> {
  let payload: unknown;
  try {
    payload = JSON.parse(await response.text(), (key: string, value: unknown, context?: { source?: string }) => {
      // Preserve the source decimal text of uint64 trading account IDs during JSON parsing.
      if (key !== "account_id" || typeof value !== "number") return value;
      if (!Number.isInteger(value)) throw new Error("Invalid Futunn account ID");
      if (Number.isSafeInteger(value)) return String(value);
      if (!context?.source) throw new Error("Futunn account ID source is unavailable");
      return BigInt(context.source).toString();
    });
  } catch {
    throw new ProviderRequestError(response.ok ? 502 : response.status, "Futunn returned invalid JSON");
  }
  const envelope = requiredResponseRecord(payload, "Futunn response");
  if (response.ok && allowNoData && envelope.ret_code === -10) return envelope;
  const error = optionalRecord(envelope.error);
  if (
    !response.ok ||
    envelope.s === "error" ||
    (envelope.ret_code !== undefined && envelope.ret_code !== 0) ||
    envelope.error
  ) {
    const message =
      optionalString(envelope.errmsg) ??
      optionalString(envelope.ret_msg) ??
      optionalString(envelope.error_description) ??
      optionalString(error?.message) ??
      optionalString(envelope.error) ??
      "request failed";
    const code = envelope.errcode ?? envelope.ret_code ?? error?.code;
    throw new ProviderRequestError(
      response.ok ? 502 : response.status,
      `Futunn${code === undefined ? "" : ` (${String(code)})`}: ${message}`,
    );
  }
  return envelope;
}

export async function requestFutunn(
  input: FutunnActionInput,
  fetcher: typeof fetch,
  path: string,
  query: Record<string, unknown> = {},
  body?: unknown,
  allowNoData = false,
): Promise<Record<string, unknown>> {
  const url = new URL(path, futunnApiBaseUrl);
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) url.searchParams.set(key, String(value));
  }
  return runProviderRequest({ label: "Futunn", signal: input.signal }, async (signal) => {
    const response = await fetcher(url, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        authorization: `Bearer ${input.accessToken}`,
        accept: "application/json",
        "content-type": "application/json",
        "user-agent": providerUserAgent,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
      redirect: "error",
    });
    const envelope = await readFutunnResponse(response, allowNoData);
    if (envelope.s === "ok" || envelope.ret_code === 0 || (allowNoData && envelope.ret_code === -10)) return envelope;
    throw new ProviderRequestError(502, "Futunn response is missing its success envelope");
  });
}

export function readFutunnList(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) throw new ProviderRequestError(502, `Futunn ${label} must be an array`);
  return value;
}

export function readFutunnData(envelope: Record<string, unknown>): unknown {
  if (envelope.ret_code === -10) return null;
  return envelope.s === "ok" ? envelope.d : envelope.data;
}
