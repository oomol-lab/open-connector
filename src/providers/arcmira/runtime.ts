import type { CredentialValidationResult } from "../../core/types.ts";
import type { ApiKeyProviderContext, ProviderActionHandlers } from "../provider-executors.ts";

import { optionalRecord, optionalString, requiredString, requiredStringArray } from "../../core/cast.ts";
import {
  ProviderRequestError,
  providerResponseError,
  readProviderJsonBody,
  runProviderRequest,
  withRetryAfterSeconds,
} from "../provider-runtime.ts";

async function requestArcmira(
  context: ApiKeyProviderContext,
  path: string,
  input: Record<string, unknown> = {},
): Promise<unknown> {
  const url = new URL(`https://api.arcmira.com/v1/${path}`);
  for (const [key, value] of Object.entries(input)) {
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      url.searchParams.set(key, String(value));
    }
  }
  return runProviderRequest({ label: "Arcmira", signal: context.signal }, async (signal) => {
    const response = await context.fetcher(url.toString(), {
      headers: { Authorization: `Bearer ${context.apiKey}`, Accept: "application/json" },
      signal,
    });
    const payload = await readProviderJsonBody(response, {
      emptyBody: null,
      invalidJsonMessage: "Arcmira returned invalid JSON",
    });
    if (!response.ok) {
      const error = optionalRecord(optionalRecord(payload)?.error);
      const status = response.status;
      throw new ProviderRequestError(
        status,
        optionalString(error?.message) ?? `Arcmira returned HTTP ${response.status}`,
        withRetryAfterSeconds(response, payload),
        status === 402 ? "insufficient_credit" : status === 429 ? "rate_limited" : "provider_error",
      );
    }
    return payload;
  });
}

type Handler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

export const arcmiraActionHandlers: ProviderActionHandlers<"arcmira", Handler> = {
  get_account: (_input, context) => requestArcmira(context, "me"),
  resolve_entity: (input, context) => requestArcmira(context, "entities/resolve", input),
  search_transcripts: (input, context) => requestArcmira(context, "search", input),
  get_transcript: ({ video_id, ...query }, context) =>
    requestArcmira(context, `transcripts/${encodeURIComponent(requiredString(video_id, "video_id"))}`, query),
};

export async function validateArcmiraCredential(context: ApiKeyProviderContext): Promise<CredentialValidationResult> {
  const payload = optionalRecord(await requestArcmira(context, "me", {}));
  const account = optionalRecord(payload?.account);
  const accountId = requiredString(account?.id, "Arcmira account ID", providerResponseError);
  return {
    profile: { accountId, displayName: optionalString(account?.name) ?? accountId },
    grantedScopes: requiredStringArray(payload?.scopes, "Arcmira scopes", providerResponseError),
  };
}
