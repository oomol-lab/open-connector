import type { CredentialValidationResult } from "../../core/types.ts";
import type { ApiKeyProviderContext, ProviderActionHandlers } from "../provider-executors.ts";
import type { ProviderFetch } from "../provider-runtime.ts";

import { compactObject, optionalInteger, optionalString } from "../../core/cast.ts";
import { readProviderTextBody } from "../provider-runtime.ts";
import {
  providerInputError,
  providerUserAgent,
  ProviderRequestError,
  requiredInputString,
  runProviderRequest,
} from "../provider-runtime.ts";

export const walletapApiBaseUrl = "https://api.walletap.io";

interface WalletapRequestInput {
  apiKey: string;
  method?: string;
  path: string;
  query?: Record<string, string | number | boolean | undefined>;
  body?: unknown;
  fetcher: ProviderFetch;
  signal?: AbortSignal;
}

type WalletapActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

export const walletapActionHandlers: ProviderActionHandlers<"walletap", WalletapActionHandler> = {
  list_templates(input, context) {
    return requestWalletapData({
      apiKey: context.apiKey,
      path: "/api/templates",
      query: { limit: optionalInteger(input.limit), starting_after: optionalString(input.startingAfter) },
      fetcher: context.fetcher,
      signal: context.signal,
    });
  },
  get_template(input, context) {
    return requestWalletapData({
      apiKey: context.apiKey,
      path: `/api/templates/${encodeURIComponent(requiredInputString(input.templateId, "templateId"))}`,
      fetcher: context.fetcher,
      signal: context.signal,
    });
  },
  list_passes(input, context) {
    return requestWalletapData({
      apiKey: context.apiKey,
      path: "/api/passes",
      query: {
        templateId: requiredInputString(input.templateId, "templateId"),
        limit: optionalInteger(input.limit),
        startAfter: optionalString(input.startAfter),
        endBefore: optionalString(input.endBefore),
        status: optionalString(input.status),
      },
      fetcher: context.fetcher,
      signal: context.signal,
    });
  },
  search_passes(input, context) {
    return requestWalletapData({
      apiKey: context.apiKey,
      path: "/api/passes/search",
      query: {
        templateId: requiredInputString(input.templateId, "templateId"),
        searchQuery: requiredInputString(input.searchQuery, "searchQuery"),
      },
      fetcher: context.fetcher,
      signal: context.signal,
    });
  },
  get_pass(input, context) {
    requirePassIdentifier(input);
    return requestWalletapData({
      apiKey: context.apiKey,
      path: "/api/pass",
      query: compactObject({
        id: optionalString(input.id),
        externalId: optionalString(input.externalId),
        templateId: optionalString(input.templateId),
        includeTemplate: typeof input.includeTemplate === "boolean" ? input.includeTemplate : undefined,
        locale: optionalString(input.locale),
      }),
      fetcher: context.fetcher,
      signal: context.signal,
    });
  },
  create_pass(input, context) {
    return requestWalletapData({
      apiKey: context.apiKey,
      method: "POST",
      path: "/api/pass",
      body: input,
      fetcher: context.fetcher,
      signal: context.signal,
    });
  },
  update_pass(input, context) {
    requirePassIdentifier(input);
    return requestWalletapData({
      apiKey: context.apiKey,
      method: "PATCH",
      path: "/api/pass",
      body: input,
      fetcher: context.fetcher,
      signal: context.signal,
    });
  },
  notify_pass(input, context) {
    const passId = requiredInputString(input.passId, "passId");
    const { passId: _, ...body } = input;
    return requestWalletapData({
      apiKey: context.apiKey,
      method: "POST",
      path: `/api/pass/${encodeURIComponent(passId)}/notify`,
      body,
      fetcher: context.fetcher,
      signal: context.signal,
    });
  },
};

export async function validateWalletapCredential(
  apiKey: string,
  fetcher: ProviderFetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  await requestWalletapData({ apiKey, path: "/api/templates", query: { limit: 1 }, fetcher, signal });
  return { profile: { accountId: "walletap", displayName: "Walletap API Key" }, grantedScopes: [], metadata: {} };
}

function requirePassIdentifier(input: Record<string, unknown>): void {
  if (optionalString(input.id) || (optionalString(input.externalId) && optionalString(input.templateId))) return;
  throw providerInputError("id or externalId together with templateId is required");
}

async function requestWalletapData(input: WalletapRequestInput): Promise<{ data: unknown }> {
  return runProviderRequest({ label: "Walletap", signal: input.signal }, async (signal) => {
    const url = new URL(input.path, walletapApiBaseUrl);
    for (const [key, value] of Object.entries(input.query ?? {}))
      if (value !== undefined) url.searchParams.set(key, String(value));
    const response = await input.fetcher(url, {
      method: input.method ?? "GET",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        "user-agent": providerUserAgent,
        "x-api-key": input.apiKey,
      },
      body: input.body === undefined ? undefined : JSON.stringify(input.body),
      signal,
    });
    const payload = parseWalletapPayload(await readProviderTextBody(response, "Walletap response"));
    if (!response.ok)
      throw new ProviderRequestError(
        response.status,
        readWalletapError(payload) ?? `Walletap request failed with HTTP ${response.status}`,
        payload,
      );
    return { data: payload };
  });
}

function parseWalletapPayload(text: string): unknown {
  if (!text) return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "Walletap returned an invalid JSON response");
  }
}

function readWalletapError(payload: unknown): string | undefined {
  if (typeof payload !== "object" || payload === null) return undefined;
  const record = payload as Record<string, unknown>;
  return optionalString(record.error) ?? optionalString(record.message);
}
