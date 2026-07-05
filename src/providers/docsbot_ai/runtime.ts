import type { CredentialValidationResult } from "../../core/types.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";
import type { DocsbotAiActionName } from "./actions.ts";

import {
  compactObject,
  nullableInteger,
  optionalBoolean,
  optionalInteger,
  optionalNumber,
  optionalRecord,
  optionalString,
  requiredString,
} from "../../core/cast.ts";
import {
  createProviderTimeout,
  isAbortLikeError,
  providerUserAgent,
  ProviderRequestError,
} from "../provider-runtime.ts";

export const docsbotAiAdminBaseUrl = "https://docsbot.ai/api";
export const docsbotAiApiBaseUrl = "https://api.docsbot.ai";

const docsbotAiDefaultRequestTimeoutMs = 30_000;

type DocsbotAiPhase = "validate" | "execute";
type DocsbotAiContext = Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">;
type DocsbotAiActionHandler = (input: Record<string, unknown>, context: DocsbotAiContext) => Promise<unknown>;

export const docsbotAiActionHandlers: Record<DocsbotAiActionName, DocsbotAiActionHandler> = {
  async list_teams(_input, context) {
    const payload = await requestDocsbotAiJson({
      baseUrl: docsbotAiAdminBaseUrl,
      path: "/teams",
      method: "GET",
      context,
      phase: "execute",
    });

    return {
      teams: normalizeTeams(payload),
    };
  },
  async get_team(input, context) {
    const payload = await requestDocsbotAiJson({
      baseUrl: docsbotAiAdminBaseUrl,
      path: `/teams/${encodeURIComponent(requiredString(input.teamId, "teamId"))}`,
      method: "GET",
      context,
      phase: "execute",
    });

    return {
      team: normalizeTeam(requireRecord(payload, "DocsBot team payload")),
    };
  },
  async list_bots(input, context) {
    const teamId = requiredString(input.teamId, "teamId");
    const payload = await requestDocsbotAiJson({
      baseUrl: docsbotAiAdminBaseUrl,
      path: `/teams/${encodeURIComponent(teamId)}/bots`,
      method: "GET",
      context,
      phase: "execute",
    });

    return {
      bots: normalizeBots(payload),
    };
  },
  async get_bot(input, context) {
    const teamId = requiredString(input.teamId, "teamId");
    const botId = requiredString(input.botId, "botId");
    const payload = await requestDocsbotAiJson({
      baseUrl: docsbotAiAdminBaseUrl,
      path: `/teams/${encodeURIComponent(teamId)}/bots/${encodeURIComponent(botId)}`,
      method: "GET",
      context,
      phase: "execute",
    });

    return {
      bot: normalizeBot(requireRecord(payload, "DocsBot bot payload")),
    };
  },
  async semantic_search(input, context) {
    const teamId = requiredString(input.teamId, "teamId");
    const botId = requiredString(input.botId, "botId");
    const payload = await requestDocsbotAiJson({
      baseUrl: docsbotAiApiBaseUrl,
      path: `/teams/${encodeURIComponent(teamId)}/bots/${encodeURIComponent(botId)}/search`,
      method: "POST",
      context,
      body: buildSearchBody(input),
      phase: "execute",
    });

    return {
      results: normalizeQuerySources(payload),
    };
  },
  async fetch_document(input, context) {
    const teamId = requiredString(input.teamId, "teamId");
    const botId = requiredString(input.botId, "botId");
    const fileId = requiredString(input.fileId, "fileId");
    const payload = await requestDocsbotAiJson({
      baseUrl: docsbotAiApiBaseUrl,
      path: `/teams/${encodeURIComponent(teamId)}/bots/${encodeURIComponent(botId)}/fetch`,
      method: "POST",
      context,
      body: { file_id: fileId },
      phase: "execute",
    });

    return {
      document: normalizeQuerySource(requireRecord(payload, "DocsBot fetch payload")),
    };
  },
};

export async function validateDocsbotAiCredential(
  apiKey: string,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const payload = await requestDocsbotAiJson({
    baseUrl: docsbotAiAdminBaseUrl,
    path: "/teams",
    method: "GET",
    context: { apiKey, fetcher, signal },
    phase: "validate",
  });
  const teams = normalizeTeams(payload);
  const firstTeam = teams[0];

  return {
    profile: {
      accountId: firstTeam ? `team:${firstTeam.id}` : "api_key",
      displayName: firstTeam ? `DocsBot AI ${firstTeam.name}` : "DocsBot AI API Key",
    },
    grantedScopes: [],
    metadata: compactObject({
      adminBaseUrl: docsbotAiAdminBaseUrl,
      apiBaseUrl: docsbotAiApiBaseUrl,
      validationEndpoint: "/teams",
      teamCount: teams.length,
      firstTeamId: firstTeam?.id,
      firstTeamName: firstTeam?.name,
    }),
  };
}

async function requestDocsbotAiJson(input: {
  baseUrl: string;
  path: string;
  method: "GET" | "POST";
  context: DocsbotAiContext;
  body?: Record<string, unknown>;
  phase: DocsbotAiPhase;
}): Promise<unknown> {
  const timeout = createProviderTimeout(input.context.signal, docsbotAiDefaultRequestTimeoutMs);
  try {
    const headers: Record<string, string> = {
      authorization: `Bearer ${input.context.apiKey}`,
      accept: "application/json",
      "user-agent": providerUserAgent,
    };
    if (input.body) {
      headers["content-type"] = "application/json";
    }

    const response = await input.context.fetcher(buildDocsbotAiUrl(input.baseUrl, input.path), {
      method: input.method,
      headers,
      body: input.body ? JSON.stringify(input.body) : undefined,
      signal: timeout.signal,
    });
    const payload = await readDocsbotAiPayload(response);

    if (!response.ok) {
      throw createDocsbotAiError(response.status, payload, input.phase);
    }

    return payload;
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }

    if (timeout.didTimeout() || isAbortLikeError(error)) {
      throw new ProviderRequestError(504, "DocsBot AI request timed out");
    }

    throw new ProviderRequestError(
      502,
      error instanceof Error ? `DocsBot AI request failed: ${error.message}` : "DocsBot AI request failed",
      error,
    );
  } finally {
    timeout.cleanup();
  }
}

function buildDocsbotAiUrl(baseUrl: string, path: string): URL {
  const normalizedPath = path.startsWith("/") ? path.slice(1) : path;
  return new URL(normalizedPath, `${baseUrl}/`);
}

async function readDocsbotAiPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (text.trim() === "") {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "DocsBot AI returned invalid JSON");
  }
}

function createDocsbotAiError(status: number, payload: unknown, phase: DocsbotAiPhase): ProviderRequestError {
  const message = extractDocsbotAiErrorMessage(payload) ?? `DocsBot AI request failed (${status})`;

  if (status === 429) {
    return new ProviderRequestError(429, message, payload);
  }

  if (phase === "validate" && status >= 400 && status < 500) {
    return new ProviderRequestError(400, message, payload);
  }

  if (phase === "execute" && (status === 401 || status === 403)) {
    return new ProviderRequestError(status, message, payload);
  }

  if (phase === "execute" && status >= 400 && status < 500) {
    return new ProviderRequestError(status, message, payload);
  }

  return new ProviderRequestError(status || 500, message, payload);
}

function extractDocsbotAiErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim() !== "") {
    return payload;
  }

  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }

  return optionalString(record.error) ?? optionalString(record.message) ?? optionalString(record.detail);
}

function normalizeTeams(payload: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(payload)) {
    throw new ProviderRequestError(502, "DocsBot AI returned an invalid teams payload", payload);
  }

  return payload.map((team) => normalizeTeam(requireRecord(team, "DocsBot team")));
}

function normalizeTeam(team: Record<string, unknown>): Record<string, unknown> {
  return {
    id: requireResponseString(team.id, "team.id"),
    name: requireResponseString(team.name, "team.name"),
    createdAt: optionalString(team.createdAt) ?? null,
    status: optionalString(team.status) ?? null,
    botCount: optionalNumber(team.botCount) ?? null,
    questionCount: optionalNumber(team.questionCount) ?? null,
    pageCount: optionalNumber(team.pageCount) ?? null,
    sourceCount: optionalNumber(team.sourceCount) ?? null,
    chunkCount: optionalNumber(team.chunkCount) ?? null,
    raw: team,
  };
}

function normalizeBots(payload: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(payload)) {
    throw new ProviderRequestError(502, "DocsBot AI returned an invalid bots payload", payload);
  }

  return payload.map((bot) => normalizeBot(requireRecord(bot, "DocsBot bot")));
}

function normalizeBot(bot: Record<string, unknown>): Record<string, unknown> {
  return {
    id: requireResponseString(bot.id, "bot.id"),
    name: requireResponseString(bot.name, "bot.name"),
    description: optionalString(bot.description) ?? null,
    privacy: optionalString(bot.privacy) ?? null,
    status: optionalString(bot.status) ?? null,
    model: optionalString(bot.model) ?? null,
    createdAt: optionalString(bot.createdAt) ?? null,
    questionCount: optionalNumber(bot.questionCount) ?? null,
    pageCount: optionalNumber(bot.pageCount) ?? null,
    sourceCount: optionalNumber(bot.sourceCount) ?? null,
    chunkCount: optionalNumber(bot.chunkCount) ?? null,
    raw: bot,
  };
}

function normalizeQuerySources(payload: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(payload)) {
    throw new ProviderRequestError(502, "DocsBot AI returned an invalid search payload", payload);
  }

  return payload.map((source) => normalizeQuerySource(requireRecord(source, "DocsBot source")));
}

function normalizeQuerySource(source: Record<string, unknown>): Record<string, unknown> {
  return {
    title: optionalString(source.title) ?? null,
    url: optionalString(source.url) ?? null,
    fileId: optionalString(source.fileId) ?? null,
    page: nullableInteger(source.page) ?? null,
    content: requireResponseString(source.content, "source.content"),
    raw: source,
  };
}

function buildSearchBody(input: Record<string, unknown>): Record<string, unknown> {
  return compactObject({
    query: requiredString(input.query, "query"),
    top_k: optionalInteger(input.top_k),
    autocut: optionalBooleanOrInteger(input.autocut),
    alpha: optionalNumber(input.alpha),
    use_glossary: optionalBoolean(input.use_glossary),
    tags: optionalStringArray(input.tags),
    include_untagged: optionalBoolean(input.include_untagged),
  });
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  const record = optionalRecord(value);
  if (!record) {
    throw new ProviderRequestError(502, `${label} is not an object`, value);
  }
  return record;
}

function requireResponseString(value: unknown, fieldName: string): string {
  const stringValue = optionalString(value);
  if (!stringValue) {
    throw new ProviderRequestError(502, `DocsBot AI response is missing ${fieldName}`, value);
  }
  return stringValue;
}

function optionalBooleanOrInteger(value: unknown): boolean | number | undefined {
  if (typeof value === "boolean") {
    return value;
  }

  return optionalInteger(value);
}

function optionalStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const values = value.map((item) => optionalString(item)).filter((item) => item !== undefined);
  return values.length > 0 ? values : undefined;
}
