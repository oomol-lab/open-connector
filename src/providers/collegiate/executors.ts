import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";
import type { CollegiateActionName } from "./actions.ts";

import { optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import { defineApiKeyProviderExecutors, defineProviderProxy, ProviderRequestError } from "../provider-runtime.ts";

const service = "collegiate";
const collegiateApiBaseUrl = "https://www.dictionaryapi.com/api/v3/references/collegiate/json";
const collegiateAudioBaseUrl = "https://media.merriam-webster.com/audio/prons/en/us/mp3";
const collegiateIllustrationPageBaseUrl = "https://www.merriam-webster.com/art/dict";
const collegiateIllustrationImageBaseUrl = "https://www.merriam-webster.com/assets/mw/static/art/dict";
const collegiateTableBaseUrl = "https://www.merriam-webster.com/table/collegiate";
const collegiateValidationTerm = "test";

type CollegiateContext = Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">;
type CollegiateActionHandler = (input: Record<string, unknown>, context: CollegiateContext) => Promise<unknown>;

export const collegiateActionHandlers: Record<CollegiateActionName, CollegiateActionHandler> = {
  async lookup_word(input, context) {
    const term = requiredString(input.term, "term", (message) => new ProviderRequestError(400, message));
    const payload = await collegiateLookup(term, context, "execute");

    return {
      query: term,
      entries: payload
        .filter((item): item is Record<string, unknown> => optionalRecord(item) !== undefined)
        .map((entry) => enrichJsonValue(entry) as Record<string, unknown>),
      suggestions: payload.filter((item): item is string => typeof item === "string"),
    };
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, collegiateActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const payload = await collegiateLookup(
      collegiateValidationTerm,
      {
        apiKey: input.apiKey,
        fetcher,
        signal,
      },
      "validate",
    );

    return {
      profile: {
        accountId: "api_key",
        displayName: "Merriam-Webster Collegiate API Key",
      },
      grantedScopes: [],
      metadata: {
        apiBaseUrl: collegiateApiBaseUrl,
        dictionaryCode: service,
        validationEndpoint: `/api/v3/references/collegiate/json/${collegiateValidationTerm}`,
        sampleResultCount: payload.length,
      },
    };
  },
};

async function collegiateLookup(
  term: string,
  context: CollegiateContext,
  phase: "validate" | "execute",
): Promise<unknown[]> {
  const response = await context.fetcher(buildLookupUrl(term, context.apiKey), {
    method: "GET",
    headers: {
      accept: "application/json",
    },
    signal: context.signal,
  });

  if (!response.ok) {
    const message = await readCollegiateError(response);
    if (response.status === 429) {
      throw new ProviderRequestError(429, message);
    }
    if (phase === "validate" && (response.status === 401 || response.status === 403)) {
      throw new ProviderRequestError(400, message);
    }
    throw new ProviderRequestError(response.status || 502, message);
  }

  const payload = (await response.json().catch(() => {
    throw new ProviderRequestError(502, "collegiate returned invalid JSON");
  })) as unknown;

  if (!Array.isArray(payload)) {
    throw new ProviderRequestError(502, "collegiate response must be an array", payload);
  }

  return payload;
}

function buildLookupUrl(term: string, apiKey: string): URL {
  const url = new URL(`${collegiateApiBaseUrl}/${encodeURIComponent(term)}`);
  url.searchParams.set("key", apiKey);
  return url;
}

async function readCollegiateError(response: Response): Promise<string> {
  const rawText = await response.text().catch(() => "");
  if (!rawText.trim()) {
    return `collegiate request failed with ${response.status}`;
  }

  try {
    const payload = JSON.parse(rawText) as unknown;
    if (typeof payload === "string" && payload.trim()) return payload;
    if (Array.isArray(payload) && typeof payload[0] === "string") return payload[0];
    const record = optionalRecord(payload);
    if (record) {
      return optionalString(record.message) ?? optionalString(record.error) ?? rawText;
    }
  } catch {
    return rawText;
  }

  return rawText;
}

function enrichJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => enrichJsonValue(item));
  }

  const record = optionalRecord(value);
  if (!record) {
    return value;
  }

  const enriched = Object.fromEntries(
    Object.entries(record).map(([key, nestedValue]) => [key, enrichJsonValue(nestedValue)]),
  );
  const audioFile = optionalString(enriched.audio);
  if (audioFile && !optionalString(enriched.audio_url)) {
    enriched.audio_url = buildAudioUrl(audioFile);
  }

  const artId = optionalString(enriched.artid);
  if (artId) {
    if (!optionalString(enriched.image_url)) {
      enriched.image_url = `${collegiateIllustrationImageBaseUrl}/${artId}.gif`;
    }
    if (!optionalString(enriched.page_url)) {
      enriched.page_url = `${collegiateIllustrationPageBaseUrl}/${artId}.htm`;
    }
  }

  const tableId = optionalString(enriched.tableid);
  if (tableId && !optionalString(enriched.page_url)) {
    enriched.page_url = `${collegiateTableBaseUrl}/${tableId}.htm`;
  }

  return enriched;
}

function buildAudioUrl(audioFile: string): string {
  return `${collegiateAudioBaseUrl}/${resolveAudioSubdirectory(audioFile)}/${audioFile}.mp3`;
}

function resolveAudioSubdirectory(audioFile: string): string {
  if (audioFile.startsWith("bix")) return "bix";
  if (audioFile.startsWith("gg")) return "gg";
  const firstCharacter = audioFile[0] ?? "";
  return /[A-Za-z]/.test(firstCharacter) ? firstCharacter.toLowerCase() : "number";
}

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: "https://www.dictionaryapi.com/api/v3/references/collegiate/json",
  auth: { type: "api_key_query", name: "key" },
});
