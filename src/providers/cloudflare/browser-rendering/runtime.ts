import type { ProviderRuntimeHandler } from "../../provider-executors.ts";
import type { CloudflareEnvelope } from "../shared/client.ts";
import type { CloudflareContext } from "../shared/context.ts";

import {
  compactObject,
  optionalBoolean,
  optionalInteger,
  optionalNumber,
  optionalRawString,
  optionalRecord,
  optionalString,
  requiredString,
} from "../../../core/cast.ts";
import { ProviderRequestError, runProviderRequest } from "../../provider-runtime.ts";
import { cloudflareRequestEnvelope } from "../shared/client.ts";
import { withAccountHandlers, resolveAccountId } from "../shared/context.ts";

export const handlers: Record<string, ProviderRuntimeHandler<CloudflareContext>> = withAccountHandlers({
  get_html_content(input, context) {
    return runTextQuickAction("content", input, context, "content");
  },
  get_markdown(input, context) {
    return runTextQuickAction("markdown", input, context, "markdown");
  },
  get_links: getLinks,
  get_json: getJson,
  scrape_elements: scrapeElements,
});

async function runTextQuickAction(
  endpoint: "content" | "markdown",
  input: Record<string, unknown>,
  context: CloudflareContext,
  outputField: "content" | "markdown",
): Promise<unknown> {
  const envelope = await runQuickAction(endpoint, input, context, buildQuickActionBody(input));
  const result = readStringResult(envelope.result, endpoint);
  return compactObject({
    [outputField]: result,
    meta: optionalRecord(envelope.meta),
  });
}

async function getLinks(input: Record<string, unknown>, context: CloudflareContext): Promise<unknown> {
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

async function getJson(input: Record<string, unknown>, context: CloudflareContext): Promise<unknown> {
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

async function scrapeElements(input: Record<string, unknown>, context: CloudflareContext): Promise<unknown> {
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
  context: CloudflareContext,
  body: Record<string, unknown>,
): Promise<CloudflareEnvelope> {
  assertUrlOrHtml(input);
  if (endpoint === "json") {
    assertJsonExtractionInstruction(input);
  }

  const accountId = resolveAccountId(input, context);

  // Cover navigation (60s), selector/fixed waits (120s each), action (5min), and 30s transport.
  return runProviderRequest({ label: "cloudflare browser run", timeoutMs: 630_000, signal: context.signal }, (signal) =>
    cloudflareRequestEnvelope(
      context.accessToken,
      {
        method: "POST",
        path: `/accounts/${encodeURIComponent(accountId)}/browser-rendering/${endpoint}`,
        query: compactObject({
          cacheTTL: optionalNumber(input.cacheTtl),
        }),
        body,
        headers: { accept: "application/json" },
      },
      context.fetcher,
      "execute",
      signal,
    ),
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
