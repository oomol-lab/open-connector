import type {
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
  ProxyExecutionResult,
} from "../../core/types.ts";

import { compactObject, optionalNumber, optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import {
  createProviderFetch,
  createProviderProxyUrl,
  defineProviderExecutors,
  normalizeProviderProxyHeaders,
  providerUserAgent,
  ProviderRequestError,
  readProviderProxyErrorMessage,
  readProviderProxyResponse,
  requireApiKeyCredential,
  requiredInputString,
  toProviderProxyError,
} from "../provider-runtime.ts";

const service = "autoblogger";
const autobloggerApiBaseUrl = "https://dash.autoblogging.ai/api/v1";
const articlesPath = "/articles";
const validationArticleId = "oomol-connect-validation";
const autobloggerFetch = createProviderFetch({ skipDnsValidation: true });

interface AutobloggerContext {
  apiKey: string;
  dashboardEmail: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

interface AutobloggerRequestInput {
  body: Record<string, unknown>;
  context: AutobloggerContext;
  phase: "validate" | "execute";
}

interface AutobloggerResponse {
  status: number;
  payload: unknown;
}

const autobloggerActionHandlers = {
  create_article(input: Record<string, unknown>, context: AutobloggerContext): Promise<unknown> {
    return createArticle(input, context);
  },
  fetch_article(input: Record<string, unknown>, context: AutobloggerContext): Promise<unknown> {
    return fetchArticle(input, context);
  },
};

export const executors: ProviderExecutors = defineProviderExecutors<AutobloggerContext>({
  service,
  handlers: autobloggerActionHandlers,
  skipDnsValidation: true,
  async createContext(context: ExecutionContext, fetcher: typeof fetch): Promise<AutobloggerContext> {
    const credential = await requireApiKeyCredential(context, service);
    return {
      apiKey: credential.apiKey,
      dashboardEmail: readDashboardEmail(credential.values.dashboardEmail),
      fetcher,
      signal: context.signal,
    };
  },
});

export const proxy: ProviderProxyExecutor = async (input, context): Promise<ProxyExecutionResult> => {
  try {
    const credential = await requireApiKeyCredential(context, service);
    const url = createProviderProxyUrl(autobloggerApiBaseUrl, input.endpoint, input.query);
    const headers = normalizeProviderProxyHeaders(input.headers);
    headers.set("accept", "application/json");
    headers.set("content-type", "application/json");
    headers.set("user-agent", providerUserAgent);
    const sourceBody =
      input.body == null
        ? {}
        : (optionalRecord(input.body) ??
          (() => {
            throw new ProviderRequestError(400, "autoblogger proxy request body must be a JSON object");
          })());
    const response = await autobloggerFetch(url, {
      method: input.method,
      headers,
      body: JSON.stringify({
        ...sourceBody,
        api_key: credential.apiKey,
        dashboard_email: readDashboardEmail(credential.values.dashboardEmail),
      }),
      signal: context.signal,
    });
    if (!response.ok) {
      throw new ProviderRequestError(
        response.status,
        await readProviderProxyErrorMessage(response, `provider request failed with HTTP ${response.status}`),
      );
    }
    return { ok: true, response: await readProviderProxyResponse(response) };
  } catch (error) {
    return toProviderProxyError(error, "autoblogger proxy request failed");
  }
};

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const dashboardEmail = readDashboardEmail(input.values.dashboardEmail);
    const response = await requestAutobloggerWithStatus({
      body: {
        dashboard_email: dashboardEmail,
        api_key: input.apiKey,
        request_type: "fetch_article",
        url_token: validationArticleId,
      },
      context: {
        apiKey: input.apiKey,
        dashboardEmail,
        fetcher,
        signal,
      },
      phase: "validate",
    });
    if (
      (response.status < 200 || response.status >= 300) &&
      (response.status !== 404 || looksLikeAuthError(response.payload))
    ) {
      throw createAutobloggerError(response.status, response.payload, "validate");
    }
    return {
      profile: {
        accountId: dashboardEmail,
        displayName: dashboardEmail,
      },
      grantedScopes: [],
      metadata: {
        apiBaseUrl: autobloggerApiBaseUrl,
        validationEndpoint: articlesPath,
      },
    };
  },
};

async function createArticle(input: Record<string, unknown>, context: AutobloggerContext): Promise<unknown> {
  const payload = await requestAutoblogger({
    body: {
      dashboard_email: context.dashboardEmail,
      api_key: context.apiKey,
      request_type: "create_article",
      ...buildCreateArticleBody(input),
    },
    context,
    phase: "execute",
  });
  const record = optionalRecord(payload) ?? {};
  return {
    status: optionalString(record.status) ?? "success",
    article_id: requiredResponseString(record.article_id, "article_id"),
    credits_used: optionalNumber(record.credits_used),
    credits_remaining: optionalNumber(record.credits_remaining),
  };
}

async function fetchArticle(input: Record<string, unknown>, context: AutobloggerContext): Promise<unknown> {
  const payload = await requestAutoblogger({
    body: {
      dashboard_email: context.dashboardEmail,
      api_key: context.apiKey,
      request_type: "fetch_article",
      url_token: requiredInputString(input.url_token, "url_token"),
    },
    context,
    phase: "execute",
  });
  const record = optionalRecord(payload) ?? {};
  const status = requiredResponseString(record.status, "status");
  if (status !== "pending" && status !== "completed" && status !== "failed") {
    throw new ProviderRequestError(502, `unexpected autoblogger article status: ${status}`);
  }
  return compactObject({
    status,
    message: optionalString(record.message),
    final_title: optionalString(record.final_title),
    final_article: optionalString(record.final_article),
    error_message: optionalString(record.error_message),
  });
}

async function requestAutoblogger(input: AutobloggerRequestInput): Promise<unknown> {
  const response = await requestAutobloggerWithStatus(input);
  if (response.status < 200 || response.status >= 300) {
    throw createAutobloggerError(response.status, response.payload, input.phase);
  }
  return response.payload;
}

async function requestAutobloggerWithStatus(input: AutobloggerRequestInput): Promise<AutobloggerResponse> {
  let response: Response;
  try {
    response = await input.context.fetcher(`${autobloggerApiBaseUrl}${articlesPath}`, {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        "user-agent": providerUserAgent,
      },
      body: JSON.stringify(input.body),
      signal: input.context.signal,
    });
  } catch (error) {
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `autoblogger request failed: ${error.message}` : "autoblogger request failed",
    );
  }
  return {
    status: response.status,
    payload: await readAutobloggerPayload(response),
  };
}

function buildCreateArticleBody(input: Record<string, unknown>): Record<string, unknown> {
  return compactObject({
    title: requiredInputString(input.title, "title"),
    project_name: optionalString(input.project_name),
    language: optionalString(input.language) ?? "English",
    length: optionalString(input.length) ?? "medium",
    tone_of_voice: optionalString(input.tone_of_voice) ?? "third-person",
    writing_style: optionalString(input.writing_style) ?? "professional",
    type_of_article: optionalString(input.type_of_article) ?? "informative",
    faqs: optionalString(input.faqs) ?? "yes",
    imagegeneration: optionalString(input.imagegeneration) ?? "no",
    godlikemode: optionalString(input.godlikemode) ?? "no",
    serp_location: optionalString(input.serp_location) ?? "us",
    outlinefromcompetition: optionalString(input.outlinefromcompetition) ?? "yes",
    keytakeaways: optionalString(input.keytakeaways) ?? "yes",
    externallinks: optionalString(input.externallinks) ?? "yes",
    videoembed: optionalString(input.videoembed) ?? "no",
    source_context: optionalString(input.source_context) ?? "na",
    wordpresspush: optionalString(input.wordpresspush) ?? "no",
    wp_siteurl: optionalString(input.wp_siteurl) ?? "",
    wp_username: optionalString(input.wp_username) ?? "",
    wp_password: optionalString(input.wp_password) ?? "",
    wp_category: optionalString(input.wp_category) ?? "",
    wp_status: optionalString(input.wp_status) ?? "draft",
    wp_customtext: optionalString(input.wp_customtext) ?? "na",
    applyautogenerateslugs: optionalString(input.applyautogenerateslugs) ?? "no",
    applyautogeneratetitles: optionalString(input.applyautogeneratetitles) ?? "no",
    combotpush: optionalString(input.combotpush) ?? "no",
    combot_triggerid: optionalString(input.combot_triggerid) ?? "na",
    intense_optimize: optionalString(input.intense_optimize) ?? "no",
    ai_proofreader: optionalString(input.ai_proofreader) ?? "no",
    proofreading_guidelines: optionalString(input.proofreading_guidelines) ?? "na",
    infographics: optionalString(input.infographics) ?? "no",
  });
}

async function readAutobloggerPayload(response: Response): Promise<unknown> {
  const text = await response.text().catch(() => "");
  if (!text.trim()) {
    return null;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch (error) {
    throw new ProviderRequestError(
      response.status === 429 ? 429 : 502,
      error instanceof Error
        ? `autoblogger returned invalid JSON: ${error.message}`
        : "autoblogger returned invalid JSON",
    );
  }
}

function createAutobloggerError(status: number, payload: unknown, phase: "validate" | "execute"): ProviderRequestError {
  const message = readErrorMessage(payload) ?? `autoblogger request failed with ${status}`;
  if (status === 400 || status === 404) {
    return new ProviderRequestError(400, message);
  } else if (status === 401 || looksLikeAuthError(payload)) {
    return new ProviderRequestError(phase === "validate" ? 401 : 400, message);
  } else if (status === 402 || status === 429) {
    return new ProviderRequestError(status, message);
  } else {
    return new ProviderRequestError(status >= 500 ? 502 : status, message);
  }
}

function looksLikeAuthError(payload: unknown): boolean {
  const message = readErrorMessage(payload)?.toLowerCase();
  return Boolean(message?.includes("invalid api key") || message?.includes("invalid email"));
}

function readErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string") {
    return payload;
  }
  const record = optionalRecord(payload);
  return record
    ? (optionalString(record.error) ?? optionalString(record.error_message) ?? optionalString(record.message))
    : undefined;
}

function readDashboardEmail(value: unknown): string {
  return requiredString(value, "dashboardEmail", (message) => new ProviderRequestError(400, message));
}

function requiredResponseString(value: unknown, fieldName: string): string {
  return requiredString(
    value,
    fieldName,
    () => new ProviderRequestError(502, `autoblogger response missing ${fieldName}`),
  );
}
