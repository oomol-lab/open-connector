import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext, ProviderRuntimeHandler } from "../provider-runtime.ts";

import { optionalInteger, optionalRecord, optionalString } from "../../core/cast.ts";
import { ProviderRequestError } from "../provider-runtime.ts";

export const hybridAnalysisApiBaseUrl = "https://hybrid-analysis.com/api/v2";

export const hybridAnalysisActionHandlers: ProviderActionHandlers<
  "hybrid_analysis",
  ProviderRuntimeHandler<ApiKeyProviderContext>
> = {
  async get_current_key(_input, context) {
    return normalizeKey(requireObject(await request("/key/current", context), "Invalid key payload"));
  },
  async search_hash(input, context) {
    const payload = requireObject(
      await request("/search/hash", context, { hash: requiredInput(input.hash, "hash") }),
      "Invalid hash search payload",
    );
    return {
      sha256s: requireStringArray(payload.sha256s, "sha256s"),
      reports: requireObjectArray(payload.reports, "reports"),
    };
  },
  async get_overview(input, context) {
    return {
      overview: requireObject(
        await request(`/overview/${encodeURIComponent(requiredInput(input.sha256, "sha256"))}`, context),
        "Invalid overview payload",
      ),
    };
  },
  async get_report_state(input, context) {
    return {
      state: requireObject(
        await request(`/report/${encodeURIComponent(requiredInput(input.reportId, "reportId"))}/state`, context),
        "Invalid report state payload",
      ),
    };
  },
  async get_report_summary(input, context) {
    return {
      summary: requireObject(
        await request(`/report/${encodeURIComponent(requiredInput(input.reportId, "reportId"))}/summary`, context),
        "Invalid report summary payload",
      ),
    };
  },
};

export async function validateHybridAnalysisCredential(
  apiKey: string,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<{
  profile: { accountId: string; displayName: string };
  grantedScopes: string[];
  metadata: Record<string, unknown>;
}> {
  const key = requireObject(
    await request("/key/current", { apiKey, fetcher, signal }, undefined, true),
    "Invalid API key information",
  );
  const levelName = optionalString(key.auth_level_name);
  return {
    profile: {
      accountId: `hybrid-analysis:${apiKey.slice(-8)}`,
      displayName: levelName ? `Hybrid Analysis ${levelName}` : "Hybrid Analysis API Key",
    },
    grantedScopes: [],
    metadata: { authLevel: optionalInteger(key.auth_level), authLevelName: levelName },
  };
}

async function request(
  path: string,
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">,
  query?: Record<string, string>,
  validating = false,
): Promise<unknown> {
  const url = new URL(path.startsWith("/") ? path.slice(1) : path, `${hybridAnalysisApiBaseUrl}/`);
  for (const [name, value] of Object.entries(query ?? {})) url.searchParams.set(name, value);
  const response = await context.fetcher(url, {
    headers: { accept: "application/json", "api-key": context.apiKey },
    signal: context.signal,
  });
  const text = await response.text();
  let payload: unknown = null;
  if (text.trim()) {
    try {
      payload = JSON.parse(text);
    } catch {
      throw new ProviderRequestError(502, "Hybrid Analysis returned invalid JSON");
    }
  }
  if (!response.ok) {
    const record = optionalRecord(payload);
    const message =
      optionalString(record?.message) ??
      optionalString(record?.error) ??
      `Hybrid Analysis request failed with HTTP ${response.status}`;
    if (validating && 400 <= response.status && response.status < 500) throw new ProviderRequestError(400, message);
    throw new ProviderRequestError(response.status, message);
  }
  return payload;
}

function normalizeKey(key: Record<string, unknown>) {
  return {
    authLevel: optionalInteger(key.auth_level) ?? null,
    authLevelName: optionalString(key.auth_level_name) ?? null,
  };
}
function requiredInput(value: unknown, field: string): string {
  if (typeof value === "string" && value) return value;
  throw new ProviderRequestError(400, `${field} is required`);
}
function requireObject(value: unknown, message: string): Record<string, unknown> {
  const record = optionalRecord(value);
  if (record) return record;
  throw new ProviderRequestError(502, message);
}
function requireStringArray(value: unknown, field: string): string[] {
  if (Array.isArray(value) && value.every((item) => typeof item === "string")) return value;
  throw new ProviderRequestError(502, `Hybrid Analysis ${field} is invalid`);
}
function requireObjectArray(value: unknown, field: string): Record<string, unknown>[] {
  if (Array.isArray(value)) {
    const records = value.map(optionalRecord);
    if (records.every((item) => item != null)) return records;
  }
  throw new ProviderRequestError(502, `Hybrid Analysis ${field} is invalid`);
}
