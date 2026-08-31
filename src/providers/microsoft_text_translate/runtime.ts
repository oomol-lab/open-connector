import { optionalRecord, optionalString, requiredStringArray } from "../../core/cast.ts";
import {
  createProviderTimeout,
  isAbortLikeError,
  providerUserAgent,
  ProviderRequestError,
} from "../provider-runtime.ts";

export const microsoftTextTranslateApiBaseUrl = "https://api.cognitive.microsofttranslator.com";
export const microsoftTextTranslateApiVersion = "3.0";

type RequestPhase = "validate" | "execute";

export interface MicrosoftTextTranslateContext {
  apiKey: string;
  region?: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

interface MicrosoftTextTranslateRequestInput {
  context: MicrosoftTextTranslateContext;
  path: string;
  phase: RequestPhase;
  query?: Record<string, unknown>;
  body?: unknown;
  acceptLanguage?: string;
}

type MicrosoftTextTranslateHandler = (
  input: Record<string, unknown>,
  context: MicrosoftTextTranslateContext,
) => Promise<unknown>;

export const microsoftTextTranslateActionHandlers: Record<string, MicrosoftTextTranslateHandler> = {
  async translate_text(input, context) {
    assertTotalTextLength(input.texts, 5_000);
    return wrapResults(
      await requestMicrosoftTextTranslate({
        context,
        path: "/translate",
        phase: "execute",
        query: {
          to: trimStringArray(input.to, "to"),
          from: optionalString(input.from),
          textType: input.textType,
          category: optionalString(input.category),
          profanityAction: input.profanityAction,
          profanityMarker: input.profanityMarker,
          fromScript: optionalString(input.fromScript),
          toScript: optionalTrimmedStringArray(input.toScript),
          includeAlignment: input.includeAlignment,
          includeSentenceLength: input.includeSentenceLength,
        },
        body: toTextBody(input.texts),
      }),
    );
  },
  async detect_language(input, context) {
    assertTotalTextLength(input.texts, 50_000);
    return wrapResults(
      await requestMicrosoftTextTranslate({
        context,
        path: "/detect",
        phase: "execute",
        body: toTextBody(input.texts),
      }),
    );
  },
  async transliterate_text(input, context) {
    assertTotalTextLength(input.texts, 5_000);
    return wrapResults(
      await requestMicrosoftTextTranslate({
        context,
        path: "/transliterate",
        phase: "execute",
        query: {
          language: requiredTrimmedString(input.language, "language"),
          fromScript: requiredTrimmedString(input.fromScript, "fromScript"),
          toScript: requiredTrimmedString(input.toScript, "toScript"),
        },
        body: toTextBody(input.texts),
      }),
    );
  },
  async break_sentences(input, context) {
    assertTotalTextLength(input.texts, 50_000);
    return wrapResults(
      await requestMicrosoftTextTranslate({
        context,
        path: "/breaksentence",
        phase: "execute",
        query: { language: optionalString(input.language), script: optionalString(input.script) },
        body: toTextBody(input.texts),
      }),
    );
  },
  async dictionary_lookup(input, context) {
    return wrapResults(
      await requestMicrosoftTextTranslate({
        context,
        path: "/dictionary/lookup",
        phase: "execute",
        query: {
          from: requiredTrimmedString(input.from, "from"),
          to: requiredTrimmedString(input.to, "to"),
        },
        body: toTextBody(input.texts),
      }),
    );
  },
  async dictionary_examples(input, context) {
    const entries = Array.isArray(input.entries) ? input.entries : [];
    return wrapResults(
      await requestMicrosoftTextTranslate({
        context,
        path: "/dictionary/examples",
        phase: "execute",
        query: {
          from: requiredTrimmedString(input.from, "from"),
          to: requiredTrimmedString(input.to, "to"),
        },
        body: entries.map((entry) => {
          const value = optionalRecord(entry) ?? {};
          return { Text: value.sourceText, Translation: value.translationText };
        }),
      }),
    );
  },
  async get_languages(input, context) {
    const scopes = optionalTrimmedStringArray(input.scopes);
    const payload = await requestMicrosoftTextTranslate({
      context,
      path: "/languages",
      phase: "execute",
      query: { scope: scopes?.join(",") },
      acceptLanguage: optionalString(input.acceptLanguage),
    });
    return { languages: requireObjectPayload(payload, "languages") };
  },
};

export async function validateMicrosoftTextTranslateCredential(context: MicrosoftTextTranslateContext): Promise<void> {
  await requestMicrosoftTextTranslate({
    context,
    path: "/detect",
    phase: "validate",
    body: [{ Text: "Hello" }],
  });
}

async function requestMicrosoftTextTranslate(input: MicrosoftTextTranslateRequestInput): Promise<unknown> {
  const timeout = createProviderTimeout(input.context.signal);
  try {
    const url = new URL(input.path, microsoftTextTranslateApiBaseUrl);
    url.searchParams.set("api-version", microsoftTextTranslateApiVersion);
    appendQuery(url, input.query);
    const response = await input.context.fetcher(url, {
      method: input.body === undefined ? "GET" : "POST",
      headers: buildHeaders(input),
      body: input.body === undefined ? undefined : JSON.stringify(input.body),
      signal: timeout.signal,
    });
    const payload = await readPayload(response);
    if (!response.ok) throw createMicrosoftTextTranslateError(response.status, payload, input.phase);
    return payload;
  } catch (error) {
    if (error instanceof ProviderRequestError) throw error;
    if (timeout.didTimeout() || isAbortLikeError(error)) {
      throw new ProviderRequestError(504, "Azure Translator request timed out");
    }
    throw new ProviderRequestError(502, "Azure Translator request failed");
  } finally {
    timeout.cleanup();
  }
}

function buildHeaders(input: MicrosoftTextTranslateRequestInput): Record<string, string> {
  const headers: Record<string, string> = {
    accept: "application/json",
    "Ocp-Apim-Subscription-Key": input.context.apiKey,
    "user-agent": providerUserAgent,
  };
  if (input.context.region) headers["Ocp-Apim-Subscription-Region"] = input.context.region;
  if (input.acceptLanguage) headers["accept-language"] = input.acceptLanguage;
  if (input.body !== undefined) headers["content-type"] = "application/json; charset=UTF-8";
  return headers;
}

function appendQuery(url: URL, query: Record<string, unknown> | undefined): void {
  for (const [key, value] of Object.entries(query ?? {})) {
    if (Array.isArray(value)) {
      for (const child of value) url.searchParams.append(key, String(child));
    } else if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }
}

function toTextBody(value: unknown): Array<{ Text: unknown }> {
  return (Array.isArray(value) ? value : []).map((text) => ({ Text: text }));
}

function assertTotalTextLength(value: unknown, maximum: number): void {
  const texts = Array.isArray(value) ? value : [];
  const total = texts.reduce(
    (length: number, text) => length + (typeof text === "string" ? Array.from(text).length : 0),
    0,
  );
  if (total > maximum) {
    throw new ProviderRequestError(400, `texts cannot exceed ${maximum} characters in total`);
  }
}

function wrapResults(payload: unknown): { results: unknown[] } {
  if (!Array.isArray(payload)) {
    throw new ProviderRequestError(502, "Azure Translator returned a non-array result");
  }
  return { results: payload };
}

function requireObjectPayload(payload: unknown, label: string): Record<string, unknown> {
  const object = optionalRecord(payload);
  if (!object) throw new ProviderRequestError(502, `Azure Translator returned invalid ${label} data`);
  return object;
}

async function readPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function createMicrosoftTextTranslateError(
  status: number,
  payload: unknown,
  phase: RequestPhase,
): ProviderRequestError {
  const error = optionalRecord(optionalRecord(payload)?.error);
  const message =
    optionalString(error?.message) ??
    optionalString(optionalRecord(payload)?.message) ??
    `Azure Translator request failed with status ${status}`;
  if (status === 401 || status === 403) {
    return new ProviderRequestError(phase === "validate" ? 400 : status, message, payload);
  }
  if (status === 429) return new ProviderRequestError(429, message, payload);
  return new ProviderRequestError(status >= 400 ? status : 502, message, payload);
}

function requiredTrimmedString(value: unknown, fieldName: string): string {
  const string = optionalString(value);
  if (!string) throw new ProviderRequestError(400, `${fieldName} is required`);
  return string;
}

function trimStringArray(value: unknown, fieldName: string): string[] {
  return requiredStringArray(value, fieldName, (message) => new ProviderRequestError(400, message)).map((item) =>
    requiredTrimmedString(item, fieldName),
  );
}

function optionalTrimmedStringArray(value: unknown): string[] | undefined {
  return value === undefined ? undefined : trimStringArray(value, "value");
}
