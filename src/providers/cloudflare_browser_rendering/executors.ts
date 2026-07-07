import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { ProviderFetch } from "../provider-runtime.ts";
import type { CloudflareBrowserRenderingActionName } from "./actions.ts";

import {
  compactObject,
  optionalBoolean,
  optionalInteger,
  optionalNumber,
  optionalRawString,
  optionalRecord,
  optionalString,
  requiredString,
} from "../../core/cast.ts";
import {
  defineProviderExecutors,
  defineProviderProxy,
  ProviderRequestError,
  providerUserAgent,
  requireApiKeyCredential,
} from "../provider-runtime.ts";

const service = "cloudflare_browser_rendering";
const cloudflareBrowserRenderingApiBaseUrl = "https://api.cloudflare.com/client/v4";

type CloudflareRequestPhase = "validate" | "execute";
type QueryValue = string | number | boolean | undefined;

interface CloudflareEnvelope {
  success?: unknown;
  result?: unknown;
  errors?: unknown;
  messages?: unknown;
  meta?: unknown;
  result_info?: unknown;
}

interface CloudflareBrowserRenderingContext {
  apiToken: string;
  accountId: string;
  fetcher: ProviderFetch;
  signal?: AbortSignal;
}

type CloudflareBrowserRenderingActionHandler = (
  input: Record<string, unknown>,
  context: CloudflareBrowserRenderingContext,
) => Promise<unknown>;

const cloudflareBrowserRenderingActionHandlers: Record<
  CloudflareBrowserRenderingActionName,
  CloudflareBrowserRenderingActionHandler
> = {
  list_accounts(input, context) {
    return listAccounts(input, context);
  },
  get_html_content(input, context) {
    return runTextQuickAction("content", input, context, "content");
  },
  get_markdown(input, context) {
    return runTextQuickAction("markdown", input, context, "markdown");
  },
  get_links(input, context) {
    return getLinks(input, context);
  },
  get_json(input, context) {
    return getJson(input, context);
  },
  scrape_elements(input, context) {
    return scrapeElements(input, context);
  },
};

export const executors: ProviderExecutors = defineProviderExecutors<CloudflareBrowserRenderingContext>({
  service,
  handlers: cloudflareBrowserRenderingActionHandlers,
  async createContext(context, fetcher): Promise<CloudflareBrowserRenderingContext> {
    const credential = await requireApiKeyCredential(context, service);
    return {
      apiToken: credential.apiKey,
      accountId: requireAccountId(credential.values),
      fetcher,
      signal: context.signal,
    };
  },
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: cloudflareBrowserRenderingApiBaseUrl,
  auth: { type: "api_key_authorization", prefix: "Bearer " },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const apiToken = input.apiKey;
    const accountId = requireAccountId(input.values);
    const validationEndpoint = `/accounts/${encodeURIComponent(accountId)}/tokens/verify`;
    const envelope = await cloudflareRequestEnvelope(
      apiToken,
      {
        path: validationEndpoint,
      },
      { fetcher, signal },
      "validate",
    );
    const verification = readObject(envelope.result, "cloudflare token verification");
    const tokenId = optionalString(verification.id);
    const tokenStatus = optionalString(verification.status);

    if (tokenStatus && tokenStatus !== "active") {
      throw new ProviderRequestError(400, `cloudflare token is not active: ${tokenStatus}`);
    }

    return {
      profile: {
        accountId,
        displayName: "Cloudflare Browser Run",
      },
      grantedScopes: [],
      metadata: compactObject({
        apiBaseUrl: cloudflareBrowserRenderingApiBaseUrl,
        validationEndpoint,
        accountId,
        tokenId,
        tokenStatus,
        expiresOn: optionalString(verification.expires_on),
        notBefore: optionalString(verification.not_before),
      }),
    };
  },
};

async function listAccounts(
  input: Record<string, unknown>,
  context: CloudflareBrowserRenderingContext,
): Promise<unknown> {
  const envelope = await cloudflareRequestEnvelope(
    context.apiToken,
    {
      path: "/accounts",
      query: compactObject({
        page: optionalInteger(input.page),
        per_page: optionalInteger(input.perPage),
      }),
    },
    context,
    "execute",
  );

  return {
    accounts: normalizeAccountList(envelope.result),
    resultInfo: normalizeResultInfo(envelope.result_info),
  };
}

async function runTextQuickAction(
  endpoint: "content" | "markdown",
  input: Record<string, unknown>,
  context: CloudflareBrowserRenderingContext,
  outputField: "content" | "markdown",
): Promise<unknown> {
  const envelope = await runQuickAction(endpoint, input, context, buildQuickActionBody(input));
  const result = readStringResult(envelope.result, endpoint);
  return compactObject({
    [outputField]: result,
    meta: optionalRecord(envelope.meta),
  });
}

async function getLinks(input: Record<string, unknown>, context: CloudflareBrowserRenderingContext): Promise<unknown> {
  const envelope = await runQuickAction(
    "links",
    input,
    context,
    compactObject({
      ...buildQuickActionBody(input),
      excludeExternalLinks: optionalBoolean(input.excludeExternalLinks),
      visibleLinksOnly: optionalBoolean(input.visibleLinksOnly),
    }),
  );

  return {
    links: readStringArray(envelope.result, "cloudflare browser run links result"),
  };
}

async function getJson(input: Record<string, unknown>, context: CloudflareBrowserRenderingContext): Promise<unknown> {
  const envelope = await runQuickAction(
    "json",
    input,
    context,
    compactObject({
      ...buildQuickActionBody(input),
      prompt: optionalString(input.prompt),
      response_format: normalizeResponseFormat(input.responseFormat),
    }),
  );

  return {
    data: envelope.result,
  };
}

async function scrapeElements(
  input: Record<string, unknown>,
  context: CloudflareBrowserRenderingContext,
): Promise<unknown> {
  const envelope = await runQuickAction(
    "scrape",
    input,
    context,
    compactObject({
      ...buildQuickActionBody(input),
      elements: normalizeScrapeElements(input.elements),
    }),
  );

  return {
    elements: normalizeScrapeResults(envelope.result),
  };
}

function normalizeScrapeElements(value: unknown): Array<Record<string, string>> | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(400, "elements must be an array.");
  }

  return value.map((item) => {
    const input = optionalRecord(item);
    if (!input) {
      throw new ProviderRequestError(400, "elements items must be objects.");
    }
    return {
      selector: requiredString(input.selector, "selector", (message) => new ProviderRequestError(400, message)),
    };
  });
}

async function runQuickAction(
  endpoint: "content" | "markdown" | "links" | "json" | "scrape",
  input: Record<string, unknown>,
  context: CloudflareBrowserRenderingContext,
  body: Record<string, unknown>,
): Promise<CloudflareEnvelope> {
  assertUrlOrHtml(input);
  if (endpoint === "json") {
    assertJsonExtractionInstruction(input);
  }

  return cloudflareRequestEnvelope(
    context.apiToken,
    {
      method: "POST",
      path: `/accounts/${encodeURIComponent(context.accountId)}/browser-rendering/${endpoint}`,
      query: compactObject({
        cacheTTL: optionalNumber(input.cacheTtl),
      }),
      body,
    },
    context,
    "execute",
  );
}

function buildQuickActionBody(input: Record<string, unknown>): Record<string, unknown> {
  return compactObject({
    url: optionalString(input.url),
    html: optionalRawString(input.html),
    actionTimeout: optionalInteger(input.actionTimeout),
    bestAttempt: optionalBoolean(input.bestAttempt),
    gotoOptions: normalizeGotoOptions(input.gotoOptions),
    setJavaScriptEnabled: optionalBoolean(input.setJavaScriptEnabled),
    userAgent: optionalString(input.userAgent),
    viewport: optionalRecord(input.viewport),
    waitForSelector: normalizeWaitForSelector(input.waitForSelector),
    waitForTimeout: optionalInteger(input.waitForTimeout),
  });
}

function normalizeGotoOptions(value: unknown): Record<string, unknown> | undefined {
  const input = optionalRecord(value);
  if (!input) {
    return undefined;
  }

  return compactObject({
    referer: optionalString(input.referer),
    referrerPolicy: optionalString(input.referrerPolicy),
    timeout: optionalInteger(input.timeout),
    waitUntil: input.waitUntil,
  });
}

function normalizeWaitForSelector(value: unknown): Record<string, unknown> | undefined {
  const input = optionalRecord(value);
  if (!input) {
    return undefined;
  }

  return compactObject({
    selector: optionalString(input.selector),
    hidden: optionalBoolean(input.hidden),
    timeout: optionalInteger(input.timeout),
    visible: optionalBoolean(input.visible),
  });
}

function normalizeResponseFormat(value: unknown): Record<string, unknown> | undefined {
  const input = optionalRecord(value);
  if (!input) {
    return undefined;
  }

  return compactObject({
    type: optionalString(input.type),
    json_schema: optionalRecord(input.jsonSchema),
  });
}

async function cloudflareRequestEnvelope(
  apiToken: string,
  request: {
    method?: "GET" | "POST";
    path: string;
    query?: Record<string, QueryValue>;
    body?: Record<string, unknown>;
  },
  context: Pick<CloudflareBrowserRenderingContext, "fetcher" | "signal">,
  phase: CloudflareRequestPhase,
): Promise<CloudflareEnvelope> {
  let response: Response;
  let envelope: CloudflareEnvelope;
  try {
    response = await context.fetcher(buildCloudflareUrl(request.path, request.query), {
      method: request.method ?? "GET",
      headers: cloudflareHeaders(apiToken, request.body != null),
      body: request.body == null ? undefined : JSON.stringify(request.body),
      signal: context.signal,
    });
    envelope = await readCloudflareEnvelope(response);
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error
        ? `cloudflare browser run request failed: ${error.message}`
        : "cloudflare browser run request failed",
    );
  }

  if (!response.ok || envelope.success === false) {
    throw normalizeCloudflareError(response, envelope, phase);
  }

  return envelope;
}

function buildCloudflareUrl(path: string, query?: Record<string, QueryValue>): string {
  const url = new URL(`${cloudflareBrowserRenderingApiBaseUrl}${path}`);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

function cloudflareHeaders(apiToken: string, hasBody: boolean): Record<string, string> {
  const headers: Record<string, string> = {
    accept: "application/json",
    authorization: `Bearer ${apiToken}`,
    "user-agent": providerUserAgent,
  };
  if (hasBody) {
    headers["content-type"] = "application/json";
  }
  return headers;
}

async function readCloudflareEnvelope(response: Response): Promise<CloudflareEnvelope> {
  const text = await response.text().catch(() => "");
  if (!text.trim()) {
    return {
      success: false,
      errors: [{ message: `cloudflare request failed with ${response.status}` }],
    };
  }

  try {
    return JSON.parse(text) as CloudflareEnvelope;
  } catch {
    return {
      success: false,
      errors: [{ message: text }],
    };
  }
}

function normalizeCloudflareError(
  response: Response,
  envelope: CloudflareEnvelope,
  phase: CloudflareRequestPhase,
): ProviderRequestError {
  const message = readCloudflareErrorMessage(envelope, response.status);

  if (response.status === 429) {
    return new ProviderRequestError(429, message, envelope);
  }

  if (phase === "validate") {
    if ([400, 401, 403, 404].includes(response.status)) {
      return new ProviderRequestError(400, message, envelope);
    }
    return new ProviderRequestError(response.status || 502, message, envelope);
  }

  if (response.status === 401) {
    return new ProviderRequestError(401, message, envelope);
  }
  if (response.status === 400 || response.status === 404) {
    return new ProviderRequestError(400, message, envelope);
  }

  return new ProviderRequestError(response.status || 502, message, envelope);
}

function readCloudflareErrorMessage(envelope: CloudflareEnvelope, status: number): string {
  const errors = Array.isArray(envelope.errors) ? envelope.errors : [];
  for (const error of errors) {
    const message = optionalString(optionalRecord(error)?.message);
    if (message) {
      return message;
    }
  }

  const messages = Array.isArray(envelope.messages) ? envelope.messages : [];
  for (const messageEntry of messages) {
    const message = optionalString(optionalRecord(messageEntry)?.message);
    if (message) {
      return message;
    }
  }

  return `cloudflare request failed with ${status}`;
}

function requireAccountId(input: Record<string, string> | undefined): string {
  return requiredString(
    input?.accountId,
    "accountId",
    (message) => new ProviderRequestError(400, `${message} for Cloudflare Browser Run`),
  );
}

function normalizeAccountList(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(502, "malformed cloudflare accounts response");
  }
  return value.map((item) => normalizeAccount(item));
}

function normalizeAccount(value: unknown): Record<string, unknown> {
  const account = readObject(value, "cloudflare account");
  return compactObject({
    id: readRequiredString(account, "id"),
    name: readRequiredString(account, "name"),
    type: optionalString(account.type),
  });
}

function normalizeResultInfo(value: unknown): Record<string, unknown> {
  const input = optionalRecord(value);
  if (!input) {
    return {};
  }

  return compactObject({
    page: optionalInteger(input.page),
    perPage: optionalInteger(input.per_page),
    count: optionalInteger(input.count),
    totalCount: optionalInteger(input.total_count),
    totalPages: optionalInteger(input.total_pages),
  });
}

function normalizeScrapeResults(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(502, "malformed cloudflare scrape response");
  }

  return value.map((item) => {
    const result = readObject(item, "cloudflare scrape result");
    return {
      selector: readRequiredString(result, "selector"),
      results: result.results,
    };
  });
}

function readStringResult(value: unknown, endpoint: string): string {
  if (typeof value !== "string") {
    throw new ProviderRequestError(502, `malformed cloudflare browser run ${endpoint} response`);
  }
  return value;
}

function readStringArray(value: unknown, fieldName: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new ProviderRequestError(502, `malformed ${fieldName}`);
  }
  return value;
}

function readObject(value: unknown, fieldName: string): Record<string, unknown> {
  const object = optionalRecord(value);
  if (!object) {
    throw new ProviderRequestError(502, `malformed ${fieldName}`);
  }
  return object;
}

function readRequiredString(input: Record<string, unknown>, fieldName: string): string {
  return requiredString(input[fieldName], fieldName, (message) => new ProviderRequestError(502, message));
}

function assertUrlOrHtml(input: Record<string, unknown>): void {
  const hasUrl = typeof input.url === "string" && input.url.trim().length > 0;
  const hasHtml = typeof input.html === "string" && input.html.trim().length > 0;
  if (hasUrl === hasHtml) {
    throw new ProviderRequestError(400, "Exactly one of url or html is required.");
  }
}

function assertJsonExtractionInstruction(input: Record<string, unknown>): void {
  const hasPrompt = typeof input.prompt === "string" && input.prompt.trim().length > 0;
  const hasResponseFormat = Boolean(optionalRecord(input.responseFormat));
  if (!hasPrompt && !hasResponseFormat) {
    throw new ProviderRequestError(400, "At least one of prompt or responseFormat is required.");
  }
}
