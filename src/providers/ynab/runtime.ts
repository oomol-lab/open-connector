import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext, ProviderFetch, ProviderRuntimeHandler } from "../provider-runtime.ts";

import { compactObject, optionalRecord, optionalString } from "../../core/cast.ts";
import { encodePathSegment } from "../../core/request.ts";
import { providerUserAgent, ProviderRequestError } from "../provider-runtime.ts";

const ynabApiBaseUrl = "https://api.ynab.com/v1";

interface YnabRequestSpec {
  path: string;
  query?: Record<string, unknown>;
}

type YnabActionHandler = ProviderRuntimeHandler<ApiKeyProviderContext>;

export const ynabActionHandlers: ProviderActionHandlers<"ynab", YnabActionHandler> = {
  get_user(_input, context) {
    return ynabRequestJson({ path: "/user" }, context, "execute");
  },
  list_plans(input, context) {
    return ynabRequestJson(
      { path: "/plans", query: compactObject({ include_accounts: input.include_accounts }) },
      context,
      "execute",
    );
  },
  get_plan(input, context) {
    return ynabRequestJson(
      { path: `/plans/${encodePathSegment(input.plan_id)}`, query: pickLastKnowledge(input) },
      context,
      "execute",
    );
  },
  get_plan_settings(input, context) {
    return ynabRequestJson({ path: `/plans/${encodePathSegment(input.plan_id)}/settings` }, context, "execute");
  },
  list_accounts(input, context) {
    return ynabRequestJson(
      { path: `/plans/${encodePathSegment(input.plan_id)}/accounts`, query: pickLastKnowledge(input) },
      context,
      "execute",
    );
  },
  get_account(input, context) {
    return ynabRequestJson(
      { path: `/plans/${encodePathSegment(input.plan_id)}/accounts/${encodePathSegment(input.account_id)}` },
      context,
      "execute",
    );
  },
  list_categories(input, context) {
    return ynabRequestJson(
      { path: `/plans/${encodePathSegment(input.plan_id)}/categories`, query: pickLastKnowledge(input) },
      context,
      "execute",
    );
  },
  get_category(input, context) {
    return ynabRequestJson(
      { path: `/plans/${encodePathSegment(input.plan_id)}/categories/${encodePathSegment(input.category_id)}` },
      context,
      "execute",
    );
  },
  get_month_category(input, context) {
    return ynabRequestJson(
      {
        path: `/plans/${encodePathSegment(input.plan_id)}/months/${encodePathSegment(
          input.month,
        )}/categories/${encodePathSegment(input.category_id)}`,
      },
      context,
      "execute",
    );
  },
  list_months(input, context) {
    return ynabRequestJson(
      { path: `/plans/${encodePathSegment(input.plan_id)}/months`, query: pickLastKnowledge(input) },
      context,
      "execute",
    );
  },
  get_month(input, context) {
    return ynabRequestJson(
      { path: `/plans/${encodePathSegment(input.plan_id)}/months/${encodePathSegment(input.month)}` },
      context,
      "execute",
    );
  },
  list_payees(input, context) {
    return ynabRequestJson(
      { path: `/plans/${encodePathSegment(input.plan_id)}/payees`, query: pickLastKnowledge(input) },
      context,
      "execute",
    );
  },
  get_payee(input, context) {
    return ynabRequestJson(
      { path: `/plans/${encodePathSegment(input.plan_id)}/payees/${encodePathSegment(input.payee_id)}` },
      context,
      "execute",
    );
  },
  list_transactions(input, context) {
    return ynabRequestJson(
      {
        path: `/plans/${encodePathSegment(input.plan_id)}/transactions`,
        query: compactObject({
          since_date: input.since_date,
          until_date: input.until_date,
          type: input.type,
          last_knowledge_of_server: input.last_knowledge_of_server,
        }),
      },
      context,
      "execute",
    );
  },
  get_transaction(input, context) {
    return ynabRequestJson(
      { path: `/plans/${encodePathSegment(input.plan_id)}/transactions/${encodePathSegment(input.transaction_id)}` },
      context,
      "execute",
    );
  },
};

export async function validateYnabCredential(
  apiKey: string,
  fetcher: ProviderFetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const payload = await ynabRequestJson({ path: "/user" }, { apiKey, fetcher, signal }, "validate");
  const user = optionalRecord(optionalRecord(payload)?.data)?.user;
  const userId = optionalString(optionalRecord(user)?.id);
  return {
    profile: {
      accountId: userId ?? "ynab-api-key",
      displayName: userId ? `YNAB User ${userId}` : "YNAB User",
      grantedScopes: ["read-only"],
    },
    metadata: compactObject({
      apiBaseUrl: ynabApiBaseUrl,
      validationEndpoint: "/user",
      userId,
    }),
  };
}

async function ynabRequestJson(
  spec: YnabRequestSpec,
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">,
  phase: "validate" | "execute",
): Promise<unknown> {
  const url = new URL(`${ynabApiBaseUrl}${spec.path}`);
  for (const [key, value] of Object.entries(spec.query ?? {})) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }

  let response: Response;
  try {
    response = await context.fetcher(url.toString(), {
      headers: {
        accept: "application/json",
        authorization: `Bearer ${context.apiKey}`,
        "user-agent": providerUserAgent,
      },
      signal: context.signal,
    });
  } catch (error) {
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `YNAB request failed: ${error.message}` : "YNAB request failed",
    );
  }

  const payload = await readYnabJson(response);
  if (!response.ok) {
    throw mapYnabError(response, payload, phase);
  }
  return payload;
}

async function readYnabJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "YNAB returned invalid JSON");
  }
}

function mapYnabError(response: Response, payload: unknown, phase: "validate" | "execute"): ProviderRequestError {
  const message = pickYnabErrorMessage(payload) ?? `YNAB request failed with HTTP ${response.status}`;
  if (response.status === 401) return new ProviderRequestError(phase === "validate" ? 400 : 401, message, payload);
  if (response.status === 403) return new ProviderRequestError(phase === "validate" ? 400 : 403, message, payload);
  if (response.status === 429) return new ProviderRequestError(429, message, payload);
  if (response.status >= 400 && response.status < 500) return new ProviderRequestError(400, message, payload);
  return new ProviderRequestError(response.status || 502, message, payload);
}

function pickYnabErrorMessage(payload: unknown): string | undefined {
  const error = optionalRecord(optionalRecord(payload)?.error);
  return optionalString(error?.detail) ?? optionalString(error?.name);
}

function pickLastKnowledge(input: Record<string, unknown>): Record<string, unknown> {
  return compactObject({ last_knowledge_of_server: input.last_knowledge_of_server });
}
