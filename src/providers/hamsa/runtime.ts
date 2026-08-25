import { optionalInteger, optionalRecord, optionalString } from "../../core/cast.ts";
import { ProviderRequestError, providerUserAgent } from "../provider-runtime.ts";

const hamsaApiBaseUrl = "https://api.tryhamsa.com";

export async function validateHamsaCredential(apiKey: string, fetcher: typeof fetch): Promise<Record<string, unknown>> {
  return requireObjectField(
    await requestHamsaJson("/v1/projects/by-api-key", apiKey, fetcher, "validate"),
    "data",
    "Hamsa project response",
  );
}

export async function executeHamsaAction(
  actionName: string,
  input: Record<string, unknown>,
  apiKey: string,
  fetcher: typeof fetch,
): Promise<unknown> {
  if (actionName === "get_project") {
    const payload = await requestHamsaJson("/v1/projects/by-api-key", apiKey, fetcher);
    return { project: requireObjectField(payload, "data", "Hamsa project response") };
  }

  if (actionName === "list_voice_agents") {
    const url = new URL("/v2/voice-agents", hamsaApiBaseUrl);
    addOptionalQuery(url, "skip", optionalInteger(input.page));
    addOptionalQuery(url, "take", optionalInteger(input.pageSize));
    addOptionalQuery(url, "search", optionalString(input.search));
    if (input.sortOrder != null) {
      url.searchParams.set("sortField", "createdAt");
      url.searchParams.set("sortOrder", optionalString(input.sortOrder) ?? "desc");
    }
    addArrayQuery(url, "type", asOptionalArray(input.types));
    addArrayQuery(url, "language", asOptionalArray(input.languages));
    const payload = await requestHamsaJson(url, apiKey, fetcher);
    const data = requireObjectField(payload, "data", "Hamsa voice agent list response");
    return {
      total: data.total,
      filtered: data.filtered,
      voiceAgents: data.voiceAgents,
    };
  }

  if (actionName === "get_voice_agent") {
    const voiceAgentId = optionalString(input.voiceAgentId);
    const payload = await requestHamsaJson(
      `/v2/voice-agents/${encodeURIComponent(voiceAgentId ?? "")}`,
      apiKey,
      fetcher,
    );
    return { voiceAgent: requireObjectField(payload, "data", "Hamsa voice agent response") };
  }

  const url = new URL("/v2/tts/voices", hamsaApiBaseUrl);
  url.searchParams.set("projectId", optionalString(input.projectId) ?? "");
  url.searchParams.set("source", optionalString(input.source) ?? "");
  url.searchParams.set("page", String(optionalInteger(input.page) ?? 1));
  url.searchParams.set("perPage", String(optionalInteger(input.pageSize) ?? 10));
  addOptionalQuery(url, "q", optionalString(input.search));
  addOptionalQuery(url, "recentlyUsed", input.recentlyUsed);
  addOptionalQuery(url, "all", input.all);
  addOptionalQuery(url, "myVoices", input.myVoices);
  addOptionalQuery(url, "favourite", input.favourite);
  addArrayQuery(url, "gender", asOptionalArray(input.genders));
  addArrayQuery(url, "language", asOptionalArray(input.languages));
  addArrayQuery(url, "style", asOptionalArray(input.styles));
  addArrayQuery(url, "dialectId", asOptionalArray(input.dialectIds));
  const payload = await requestHamsaJson(url, apiKey, fetcher);
  const data = requireObjectField(payload, "data", "Hamsa TTS voice list response");
  return {
    voices: data.voices,
    totalPages: data.totalPages,
    page: data.page,
    totalCount: data.totalCount,
  };
}

function addOptionalQuery(url: URL, name: string, value: unknown) {
  if (value != null) url.searchParams.set(name, String(value));
}

function addArrayQuery(url: URL, name: string, values: unknown[] | undefined) {
  for (const value of values ?? []) url.searchParams.append(name, String(value));
}

function asOptionalArray(value: unknown) {
  return Array.isArray(value) ? value : undefined;
}

async function requestHamsaJson(
  path: string | URL,
  apiKey: string,
  fetcher: typeof fetch,
  phase: "validate" | "execute" = "execute",
) {
  let response: Response;
  try {
    response = await fetcher(new URL(path, hamsaApiBaseUrl), {
      method: "GET",
      headers: {
        accept: "application/json",
        authorization: `Token ${apiKey}`,
        "user-agent": providerUserAgent,
      },
    });
  } catch (error) {
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Hamsa request failed: ${error.message}` : "Hamsa request failed",
    );
  }

  const text = await response.text();
  let payload: unknown = null;
  if (text.trim() !== "") {
    try {
      payload = JSON.parse(text);
    } catch {
      if (response.ok) {
        throw new ProviderRequestError(502, "Hamsa returned invalid JSON");
      }
    }
  }

  if (!response.ok) {
    const record = optionalRecord(payload);
    const message = optionalString(record?.message) ?? `Hamsa request failed with status ${response.status}`;
    if (response.status === 429) throw new ProviderRequestError(429, message);
    if (response.status === 401 || response.status === 403) {
      throw new ProviderRequestError(phase === "validate" ? 400 : 401, message);
    }
    throw new ProviderRequestError(response.status >= 500 ? 502 : response.status, message);
  }
  return payload;
}

function requireObjectField(payload: unknown, field: string, label: string) {
  const object = optionalRecord(payload);
  const value = optionalRecord(object?.[field]);
  if (!value) throw new ProviderRequestError(502, `${label} did not include ${field}`);
  return value;
}
