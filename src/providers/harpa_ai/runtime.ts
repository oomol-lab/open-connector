import type { ApiKeyProviderContext, ProviderActionHandlers } from "../provider-executors.ts";

import { optionalInteger, optionalRecord, optionalString } from "../../core/cast.ts";
import {
  ProviderRequestError,
  providerResponseError,
  providerUserAgent,
  runProviderRequest,
} from "../provider-runtime.ts";

export const harpaAiApiBaseUrl = "https://api.harpa.ai/api/v1";
const responseOverheadMs = 10_000;
interface HarpaRequest {
  action: "serp" | "scrape" | "command" | "prompt";
  url?: unknown;
  query?: unknown;
  name?: unknown;
  inputs?: unknown;
  resultParam?: unknown;
  grab?: unknown;
  node?: unknown;
  timeout?: unknown;
  connection?: unknown;
  prompt?: unknown;
}
type Handler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

export const handlers: ProviderActionHandlers<"harpa_ai", Handler> = {
  search_web(input, context) {
    return execute({ action: "serp", query: input.query, node: input.node, timeout: input.timeout }, context);
  },
  scrape_web_page(input, context) {
    return execute(
      { action: "scrape", url: input.url, grab: input.grab, node: input.node, timeout: input.timeout },
      context,
    );
  },
  run_ai_command(input, context) {
    return execute(
      {
        action: "command",
        url: input.url,
        name: input.name,
        inputs: input.inputs,
        resultParam: input.resultParam,
        node: input.node,
        timeout: input.timeout,
        connection: input.connection,
      },
      context,
    );
  },
  run_ai_prompt(input, context) {
    return execute(
      {
        action: "prompt",
        prompt: input.prompt,
        url: input.url,
        node: input.node,
        timeout: input.timeout,
        connection: input.connection,
      },
      context,
    );
  },
};

async function execute(body: HarpaRequest, context: ApiKeyProviderContext) {
  const result = await request(body, context, (optionalInteger(body.timeout) ?? 300_000) + responseOverheadMs);
  return { result };
}
async function request(body: HarpaRequest, context: ApiKeyProviderContext, timeoutMs: number) {
  return runProviderRequest({ label: "HARPA AI", signal: context.signal, timeoutMs }, async (signal) => {
    const response = await context.fetcher(`${harpaAiApiBaseUrl}/grid`, {
      method: "POST",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${context.apiKey}`,
        "content-type": "application/json",
        "user-agent": providerUserAgent,
      },
      body: JSON.stringify(body),
      signal,
    });
    const text = await response.text();
    let payload: unknown = null;
    if (text.trim()) {
      try {
        payload = JSON.parse(text) as unknown;
      } catch {
        if (response.ok) throw providerResponseError("HARPA AI returned invalid JSON");
        payload = text.trim();
      }
    }
    if (!response.ok) {
      const record = optionalRecord(payload);
      const message =
        optionalString(payload) ??
        optionalString(record?.message) ??
        optionalString(record?.error) ??
        `HARPA AI request failed with status ${response.status}`;
      throw new ProviderRequestError(response.status || 502, message);
    }
    return payload;
  });
}
