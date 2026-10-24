import type { ApiKeyProviderContext } from "../provider-executors.ts";

import { sha256Hex } from "../../core/aws-sigv4.ts";
import { optionalRecord, optionalString } from "../../core/cast.ts";
import { storeResponseInTransit } from "../../core/request.ts";
import {
  basicAuthorizationHeader,
  isAbortLikeError,
  providerInputError,
  providerResponseError,
  providerUserAgent,
  ProviderRequestError,
  requiredInputString,
  requiredResponseRecord,
  runProviderRequest,
} from "../provider-runtime.ts";
import { hrmosOperations } from "./operations.ts";

export function normalizeCompany(value: unknown): string {
  let company = requiredInputString(value, "companyUrl");
  if (company.startsWith("https://")) {
    let url: URL;
    try {
      url = new URL(company);
    } catch {
      throw providerInputError("companyUrl must be a valid HRMOS login URL");
    }
    if (url.origin !== "https://ieyasu.co" || url.username || url.password || url.search || url.hash) {
      throw providerInputError("Use an HRMOS company login URL on https://ieyasu.co");
    }
    company = url.pathname.slice(1);
    if (company.endsWith("/")) company = company.slice(0, -1);
    const segments = company.split("/");
    if (segments.length === 2 && segments[1] === "login") company = segments[0]!;
  }
  const allowed = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_-";
  if (!company || [...company].some((character) => !allowed.includes(character))) {
    throw providerInputError("companyUrl must be the company slug or its https://ieyasu.co login URL");
  }
  return company;
}

export function hrmosBaseUrl(company: string): string {
  return `https://ieyasu.co/api/${normalizeCompany(company)}/v1`;
}

export async function readHrmosError(response: Response): Promise<ProviderRequestError> {
  let body: unknown;
  try {
    body = await response.json();
  } catch (error) {
    if (isAbortLikeError(error)) throw error;
  }
  // The generic 401 response cannot distinguish keys, tokens and permissions.
  return new ProviderRequestError(
    response.status,
    optionalString(optionalRecord(body)?.message) ?? `HRMOS Kintai request failed (${response.status})`,
    undefined,
    response.status === 429 ? "rate_limited" : "provider_error",
  );
}

async function readJson(response: Response): Promise<unknown> {
  if (!response.ok) throw await readHrmosError(response);
  try {
    return await response.json();
  } catch (error) {
    if (isAbortLikeError(error)) throw error;
    throw providerResponseError("HRMOS Kintai returned invalid JSON");
  }
}

function paginationInteger(headers: Headers, name: string): number | null {
  const raw = headers.get(name);
  if (raw === null || raw.trim() === "") return null;
  const value = Number(raw);
  return Number.isInteger(value) && value >= 0 ? value : null;
}

const tokens = new Map<string, Promise<{ token: string; expiresAt: number }>>();

export async function authenticate(
  company: string,
  apiKey: string,
  fetcher: typeof fetch,
  signal?: AbortSignal,
  force = false,
): Promise<string> {
  const cacheKey = sha256Hex(JSON.stringify([company, apiKey]));
  if (force) tokens.delete(cacheKey);
  const cached = tokens.get(cacheKey);
  if (cached) {
    const result = await cached;
    if (result.expiresAt > Date.now()) return result.token;
    if (tokens.get(cacheKey) !== cached) return authenticate(company, apiKey, fetcher, signal);
    tokens.delete(cacheKey);
  }
  const pending = runProviderRequest({ label: "HRMOS Kintai authentication", signal }, async (requestSignal) => {
    const response = await fetcher(`${hrmosBaseUrl(company)}/authentication/token`, {
      method: "GET",
      headers: {
        // HRMOS encodes the Secret Key itself, with no trailing Basic-auth colon.
        authorization: basicAuthorizationHeader(apiKey),
        accept: "application/json",
        "content-type": "application/json",
        "user-agent": providerUserAgent,
      },
      signal: requestSignal,
    });
    const body = requiredResponseRecord(await readJson(response), "HRMOS Kintai token response");
    const token = optionalString(body.token);
    const expiresAt = Date.parse(optionalString(body.expired_at) ?? "");
    if (!token?.trim() || !Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
      throw providerResponseError("HRMOS Kintai returned an invalid or expired token");
    }
    return { token, expiresAt: expiresAt - Math.min(60_000, (expiresAt - Date.now()) / 2) };
  });
  tokens.set(cacheKey, pending);
  if (tokens.size > 500) {
    const oldest = tokens.keys().next().value;
    if (oldest !== undefined) tokens.delete(oldest);
  }
  try {
    return (await pending).token;
  } catch (error) {
    if (tokens.get(cacheKey) === pending) tokens.delete(cacheKey);
    throw error;
  }
}

export interface HrmosContext extends ApiKeyProviderContext {
  company: string;
}

export async function executeHrmosAction(
  actionName: string,
  parameters: Record<string, unknown>,
  context: HrmosContext,
): Promise<unknown> {
  const { company, apiKey, fetcher, transitFiles } = context;
  const operation = hrmosOperations[actionName];
  if (!operation) throw providerInputError("Unknown HRMOS Kintai action");
  if (operation.response === "file" && !transitFiles) {
    throw new ProviderRequestError(500, "HRMOS CSV export requires transit storage");
  }
  let path = operation.path;
  const aliases: Record<string, string> = {
    employeeId: "user_id",
    leaveTypeId: "id",
    prefectureId: "prefectural_id",
    stampType: "stamp_type",
    employeeNumbers: "number",
    statuses: "status",
    ...operation.aliases,
  };
  const query = new URLSearchParams();
  for (const [name, value] of Object.entries(parameters)) {
    if (value === undefined || name === operation.bodyField) continue;
    const upstream = aliases[name] ?? name;
    const marker = `{${upstream}}`;
    if (path.includes(marker)) path = path.replace(marker, encodeURIComponent(String(value)));
    else if (name === "employeeNumbers" && Array.isArray(value)) {
      // OpenAPI form + explode arrays use repeated parameter names.
      for (const number of value) query.append("number", String(number));
    } else query.set(upstream, Array.isArray(value) ? value.join(",") : String(value));
  }
  const token = await authenticate(company, apiKey, fetcher, context.signal);
  return runProviderRequest(
    {
      label: "HRMOS Kintai",
      signal: context.signal,
      timeoutMs: operation.response === "file" ? 120_000 : undefined,
    },
    async (signal) => {
      const url = new URL(`${hrmosBaseUrl(company)}${path}`);
      url.search = query.toString();
      const response = await fetcher(url, {
        method: operation.method,
        headers: {
          authorization: `Token ${token}`,
          "content-type": "application/json",
          accept: operation.response === "file" ? "text/csv" : "application/json",
          "user-agent": providerUserAgent,
        },
        body: operation.bodyField ? JSON.stringify(parameters[operation.bodyField]) : undefined,
        signal,
      });
      if (response.status === 401) tokens.delete(sha256Hex(JSON.stringify([company, apiKey])));
      if (operation.response === "file") {
        if (!response.ok) throw await readHrmosError(response);
        const mimeType = response.headers.get("content-type") || "text/csv";
        if (mimeType.includes("text/html") || mimeType.includes("application/json")) {
          await response.body?.cancel();
          throw providerResponseError("HRMOS Kintai returned a non-CSV export response");
        }
        const name = `hrmos-${actionName.slice("export_".length)}-${parameters.year}.csv`;
        const file = await storeResponseInTransit(response, transitFiles!, {
          name,
          mimeType,
          signal,
          maxBytes: 64 * 1024 * 1024,
          fieldName: "HRMOS Kintai CSV export",
          createError: providerResponseError,
        });
        if (file.sizeBytes === 0) {
          await transitFiles!.delete(file.fileId);
          throw providerResponseError("HRMOS Kintai returned an empty CSV export");
        }
        return { file };
      }
      const payload = await readJson(response);
      if (operation.response === "record") {
        return { record: requiredResponseRecord(payload, "HRMOS Kintai operation response") };
      }
      if (operation.response === "definitions") {
        const definitions = requiredResponseRecord(payload, "HRMOS Kintai report definitions");
        if (!Array.isArray(definitions.items)) {
          throw providerResponseError("HRMOS Kintai definitions must include items");
        }
        return definitions;
      }
      if (!Array.isArray(payload)) throw providerResponseError("HRMOS Kintai list response must be an array");
      const page = Number(parameters.page ?? 1);
      const totalPages = paginationInteger(response.headers, "X-Total-Page");
      return {
        items: payload,
        page,
        totalCount: paginationInteger(response.headers, "X-Total-Count"),
        totalPages,
        nextPage: totalPages !== null && page < totalPages ? page + 1 : null,
        useHourHoliday: response.headers.get("X-Use-Hour-Holiday"),
      };
    },
  );
}
