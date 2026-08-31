import type { ApiKeyActionRequest, ProviderActionHandlers } from "../provider-runtime.ts";
import type { ProductlaneActionName } from "./actions.ts";

import { requiredString } from "../../core/cast.ts";
import { encodePathSegment } from "../../core/request.ts";
import { ProviderRequestError, providerUserAgent } from "../provider-runtime.ts";

export interface ProductlaneCredentialCheck {
  providerAccountId?: string;
  accountLabel: string;
  providerScopes: string[];
  providerMetadata: Record<string, unknown>;
}

export const productlaneApiBaseUrl = "https://productlane.com/api/v2";
export const productlaneValidationPath = "/me";

type ProductlaneActionContext = {
  apiKey: string;
  fetcher: typeof fetch;
};

type ProductlaneActionHandler = (input: Record<string, unknown>, context: ProductlaneActionContext) => Promise<unknown>;

type ProductlaneRequestOptions = {
  path: string;
  apiKey: string;
  fetcher: typeof fetch;
  phase: "validate" | "execute";
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  query?: Record<string, unknown>;
  body?: unknown;
};

export const productlaneActionHandlers: ProviderActionHandlers<"productlane", ProductlaneActionHandler> = {
  get_authenticated_identity(_input, context) {
    return requestProductlaneJson({
      path: productlaneValidationPath,
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      phase: "execute",
    });
  },
  list_companies(input, context) {
    return requestProductlaneJson({
      path: "/companies",
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      phase: "execute",
      query: input,
    });
  },
  create_company(input, context) {
    return requestProductlaneJson({
      path: "/companies",
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      phase: "execute",
      method: "POST",
      body: input,
    });
  },
  get_company(input, context) {
    return requestProductlaneJson({
      path: `/companies/${encodePathSegment(input.id)}`,
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      phase: "execute",
    });
  },
  update_company(input, context) {
    return requestProductlaneJson({
      path: `/companies/${encodePathSegment(input.id)}`,
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      phase: "execute",
      method: "PATCH",
      body: omitId(input),
    });
  },
  delete_company(input, context) {
    return requestProductlaneJson({
      path: `/companies/${encodePathSegment(input.id)}`,
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      phase: "execute",
      method: "DELETE",
    });
  },
  list_contacts(input, context) {
    return requestProductlaneJson({
      path: "/contacts",
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      phase: "execute",
      query: input,
    });
  },
  create_contact(input, context) {
    requireAtMostOneCompanySelector(input);
    return requestProductlaneJson({
      path: "/contacts",
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      phase: "execute",
      method: "POST",
      body: input,
    });
  },
  get_contact(input, context) {
    return requestProductlaneJson({
      path: `/contacts/${encodePathSegment(input.id)}`,
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      phase: "execute",
    });
  },
  update_contact(input, context) {
    requireAtMostOneCompanySelector(input);
    return requestProductlaneJson({
      path: `/contacts/${encodePathSegment(input.id)}`,
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      phase: "execute",
      method: "PATCH",
      body: omitId(input),
    });
  },
  delete_contact(input, context) {
    return requestProductlaneJson({
      path: `/contacts/${encodePathSegment(input.id)}`,
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      phase: "execute",
      method: "DELETE",
    });
  },
};

function requireAtMostOneCompanySelector(input: Record<string, unknown>): void {
  const selectorCount = ["company_id", "company_name", "company_external_id"].filter(
    (field) => input[field] !== undefined,
  ).length;
  if (selectorCount > 1) {
    throw new ProviderRequestError(400, "Provide at most one of company_id, company_name, or company_external_id.");
  }
}

export async function validateProductlaneCredential(
  input: Record<string, string>,
  fetcher: typeof fetch,
): Promise<ProductlaneCredentialCheck> {
  const apiKey = requiredString(input.apiKey, "apiKey", (message) => new ProviderRequestError(400, message));
  const payload = await requestProductlaneJson({
    path: productlaneValidationPath,
    apiKey,
    fetcher,
    phase: "validate",
  });
  const identity = readObject(payload);
  const workspaceId = readRequiredString(identity.workspace_id, "Productlane returned an invalid workspace_id");
  const apiKeyId = readRequiredString(identity.api_key_id, "Productlane returned an invalid api_key_id");
  const scopes = readStringArray(identity.scopes, "Productlane returned invalid API key scopes");
  const linearTeamIds = readStringArray(identity.linear_team_ids, "Productlane returned invalid Linear team IDs");
  const defaultLinearTeamId = readNullableString(
    identity.default_linear_team_id,
    "Productlane returned an invalid default Linear team ID",
  );

  return {
    providerAccountId: workspaceId,
    accountLabel: `Productlane workspace ${workspaceId}`,
    providerScopes: scopes,
    providerMetadata: {
      apiBaseUrl: productlaneApiBaseUrl,
      validationEndpoint: productlaneValidationPath,
      apiKeyId,
      linearTeamIds,
      defaultLinearTeamId,
    },
  };
}

export async function executeProductlaneAction(
  input: ApiKeyActionRequest & {
    actionName: ProductlaneActionName;
    input: Record<string, unknown>;
  },
  fetcher: typeof fetch,
): Promise<unknown> {
  const handler = productlaneActionHandlers[input.actionName];
  if (!handler) {
    throw new ProviderRequestError(400, `unknown productlane action: ${input.actionName}`);
  }

  return handler(input.input, {
    apiKey: requiredString(input.apiKey, "apiKey", (message) => new ProviderRequestError(400, message)),
    fetcher,
  });
}

async function requestProductlaneJson(options: ProductlaneRequestOptions) {
  const url = new URL(`${productlaneApiBaseUrl}${options.path}`);
  for (const [key, value] of Object.entries(options.query ?? {})) {
    if (value !== undefined && value !== null) {
      url.searchParams.set(key, String(value));
    }
  }

  const headers: Record<string, string> = {
    accept: "application/json",
    authorization: `Bearer ${options.apiKey}`,
    "user-agent": providerUserAgent,
  };
  if (options.body !== undefined) {
    headers["content-type"] = "application/json";
  }

  let response: Response;
  try {
    response = await options.fetcher(url, {
      method: options.method ?? "GET",
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
  } catch (error) {
    throw new ProviderRequestError(
      502,
      `productlane request failed: ${error instanceof Error ? error.message : "Unknown transport error"}`,
    );
  }

  const payload = await readProductlanePayload(response);
  if (!response.ok) {
    throw mapProductlaneError(response.status, payload, options.phase);
  }

  return payload;
}

async function readProductlanePayload(response: Response) {
  const text = await response.text();
  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    if (response.ok) {
      throw new ProviderRequestError(502, "productlane returned malformed JSON");
    }

    return { message: text };
  }
}

function mapProductlaneError(status: number, payload: unknown, phase: "validate" | "execute") {
  const message = readErrorMessage(payload) ?? `Productlane API request failed with status ${status}`;
  const providerCode = readErrorCode(payload);

  if (status === 401 || status === 410) {
    return phase === "validate" ? new ProviderRequestError(400, message) : new ProviderRequestError(401, message);
  }

  if (status === 403) {
    // Productlane's official error contract distinguishes scope_required from forbidden: https://productlane.mintlify.dev/docs/api-v2/errors
    if (phase === "execute" && providerCode === "scope_required") {
      return new ProviderRequestError(403, message);
    }
    return new ProviderRequestError(phase === "validate" ? 400 : 403, message);
  }

  if (status === 429) {
    return new ProviderRequestError(429, message);
  }

  if (status === 400 || status === 404 || status === 409 || status === 422) {
    return new ProviderRequestError(status, message);
  }

  return new ProviderRequestError(status >= 500 ? status : 502, message);
}

function readErrorCode(payload: unknown) {
  const body = optionalRecord(payload);
  const nestedError = optionalRecord(body?.error);
  return asOptionalNonEmptyString(nestedError?.code) ?? asOptionalNonEmptyString(body?.code);
}

function readErrorMessage(payload: unknown) {
  const body = optionalRecord(payload);
  const nestedError = optionalRecord(body?.error);
  const nestedMessage = asOptionalNonEmptyString(nestedError?.message);
  if (nestedMessage) {
    return nestedMessage;
  }

  const message = asOptionalNonEmptyString(body?.message);
  if (message) {
    return message;
  }

  const issues = Array.isArray(body?.issues) ? body.issues : [];
  for (const issue of issues) {
    const issueMessage = asOptionalNonEmptyString(optionalRecord(issue)?.message);
    if (issueMessage) {
      return issueMessage;
    }
  }

  return undefined;
}

function omitId(input: Record<string, unknown>) {
  const { id: _id, ...body } = input;
  return body;
}

function readObject(value: unknown) {
  const object = optionalRecord(value);
  if (!object) {
    throw new ProviderRequestError(502, "Productlane returned an invalid JSON object");
  }
  return object;
}

function readRequiredString(value: unknown, message: string) {
  const stringValue = asOptionalNonEmptyString(value);
  if (!stringValue) {
    throw new ProviderRequestError(502, message);
  }
  return stringValue;
}

function readNullableString(value: unknown, message: string) {
  if (value === null) {
    return null;
  }
  return readRequiredString(value, message);
}

function readStringArray(value: unknown, message: string) {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new ProviderRequestError(502, message);
  }
  return value as string[];
}

function optionalRecord(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  return value as Record<string, unknown>;
}

function asOptionalNonEmptyString(value: unknown) {
  return typeof value === "string" && value ? value : undefined;
}
