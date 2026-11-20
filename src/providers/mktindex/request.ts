import { optionalRecord, optionalString } from "../../core/cast.ts";
import {
  readProviderTextBody,
  providerResponseError,
  providerUserAgent,
  ProviderRequestError,
} from "../provider-runtime.ts";
export const mktindexApiBaseUrl = "https://market.moojing.com/api";
type MktindexPhase = "validate" | "execute";
interface RequestInput {
  baseUrl?: string;
  path: string;
  method?: "GET" | "POST" | "DELETE";
  apiKey: string;
  query?: Record<string, string | undefined>;
  jsonBody?: unknown;
  formBody?: Record<string, string>;
  fetcher: typeof fetch;
  phase: MktindexPhase;
  signal?: AbortSignal;
}
export async function requestMktindexResult(input: RequestInput): Promise<unknown> {
  return (await requestMktindexEnvelope(input)).result;
}
export async function requestMktindexEnvelope(input: RequestInput): Promise<Record<string, unknown>> {
  const url = new URL(input.path.replace(/^\//u, ""), `${input.baseUrl ?? mktindexApiBaseUrl}/`);
  for (const [k, v] of Object.entries(input.query ?? {})) if (v !== undefined) url.searchParams.set(k, v);
  const headers = new Headers({
    "accept": "application/json",
    "MOOJING-APIKEY": input.apiKey,
    "user-agent": providerUserAgent,
  });
  let body: string | undefined;
  if (input.jsonBody !== undefined) {
    headers.set("content-type", "application/json");
    body = JSON.stringify(input.jsonBody);
  } else if (input.formBody) {
    headers.set("content-type", "application/x-www-form-urlencoded;charset=UTF-8");
    body = new URLSearchParams(input.formBody).toString();
  }
  const response = await input.fetcher(url, { method: input.method ?? "GET", headers, body, signal: input.signal });
  const text = await readProviderTextBody(response, "Mktindex response");
  let payload: unknown;
  try {
    payload = JSON.parse(text);
  } catch {
    throw providerResponseError(text ? "Moojing returned invalid JSON" : "Moojing returned an empty response");
  }
  const record = optionalRecord(payload);
  if (!record) throw providerResponseError("Moojing returned an invalid response");
  if (!response.ok || record.status === "error") {
    const code = typeof record.code === "number" ? record.code : undefined;
    const message =
      optionalString(record.message) ??
      optionalString(record.msg) ??
      `Moojing request failed with status ${response.status}`;
    throw new ProviderRequestError(code === -413 ? 429 : response.status || 502, message, record);
  }
  if (record.status !== "ok") throw providerResponseError("Moojing returned an unknown response status");
  return record;
}
