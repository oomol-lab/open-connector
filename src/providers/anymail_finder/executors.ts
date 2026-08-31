import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";
import type { ApiKeyProviderContext, ProviderActionHandlers, ProviderRuntimeHandler } from "../provider-runtime.ts";

import { compactObject, optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import {
  defineApiKeyProviderExecutors,
  providerInputError,
  providerUserAgent,
  ProviderRequestError,
} from "../provider-runtime.ts";

const service = "anymail_finder";
const apiBaseUrl = "https://api.anymailfinder.com";

export const anymailFinderActionHandlers: ProviderActionHandlers<
  "anymail_finder",
  ProviderRuntimeHandler<ApiKeyProviderContext>
> = {
  async get_account(_input, context) {
    const raw = await request("/v5.1/account", context);
    return { email: readString(raw, "email"), creditsLeft: readNumber(raw, "credits_left"), raw };
  },
  async find_person_email(input, context) {
    validatePersonSearch(input);
    return wrapResult(
      await post("/v5.1/find-email/person", context, {
        domain: optionalString(input.domain),
        company_name: optionalString(input.companyName),
        first_name: optionalString(input.firstName),
        last_name: optionalString(input.lastName),
        full_name: optionalString(input.fullName),
        linkedin_url: optionalString(input.linkedinUrl),
      }),
    );
  },
  async find_company_emails(input, context) {
    return wrapResult(
      await post("/v5.1/find-email/company", context, {
        ...companyFields(input),
        email_type: optionalString(input.emailType),
      }),
    );
  },
  async find_decision_maker_email(input, context) {
    return wrapResult(
      await post("/v5.1/find-email/decision-maker", context, {
        ...companyFields(input),
        decision_maker_category: input.categories,
      }),
    );
  },
  async verify_email(input, context) {
    return wrapResult(
      await post("/v5.1/verify-email", context, {
        email: requiredString(input.email, "email", providerInputError),
      }),
    );
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, anymailFinderActionHandlers, {
  skipDnsValidation: true,
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const payload = await request("/v5.1/account", { apiKey: input.apiKey, fetcher, signal });
    const email = readString(payload, "email");
    return {
      profile: { accountId: email, displayName: email },
      grantedScopes: [],
      metadata: {
        apiBaseUrl,
        validationEndpoint: "/v5.1/account",
        creditsLeft: readNumber(payload, "credits_left"),
      },
    };
  },
};

function validatePersonSearch(input: Record<string, unknown>): void {
  if (optionalString(input.linkedinUrl)) return;
  const hasName =
    Boolean(optionalString(input.fullName)) ||
    (Boolean(optionalString(input.firstName)) && Boolean(optionalString(input.lastName)));
  const hasCompany = Boolean(optionalString(input.domain)) || Boolean(optionalString(input.companyName));
  if (hasName && hasCompany) return;
  throw providerInputError("linkedinUrl or a person name together with domain or companyName is required");
}

function companyFields(input: Record<string, unknown>): Record<string, unknown> {
  const domain = optionalString(input.domain);
  const companyName = optionalString(input.companyName);
  if (!domain && !companyName) throw providerInputError("domain or companyName is required");
  return { domain, company_name: companyName };
}

async function post(
  path: string,
  context: ApiKeyProviderContext,
  body: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  return request(path, context, { method: "POST", body: JSON.stringify(compactObject(body)) });
}

async function request(
  path: string,
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">,
  init: RequestInit = {},
): Promise<Record<string, unknown>> {
  let response: Response;
  try {
    response = await context.fetcher(`${apiBaseUrl}${path}`, {
      ...init,
      headers: {
        accept: "application/json",
        authorization: context.apiKey,
        "content-type": "application/json",
        "user-agent": providerUserAgent,
        ...init.headers,
      },
      signal: context.signal,
    });
  } catch (error) {
    throw new ProviderRequestError(
      502,
      `Anymail Finder request failed: ${error instanceof Error ? error.message : "Unknown transport error"}`,
      error,
    );
  }

  const payload = await readPayload(response);
  if (response.ok) return payload;
  const message =
    optionalString(payload.message) ??
    optionalString(payload.error) ??
    `Anymail Finder request failed with ${response.status}`;
  if (response.status === 401 || response.status === 403 || response.status === 429) {
    throw new ProviderRequestError(response.status, message);
  }
  throw new ProviderRequestError(response.status >= 400 && response.status < 500 ? 400 : 502, message);
}

async function readPayload(response: Response): Promise<Record<string, unknown>> {
  const text = await response.text();
  if (!text) return {};
  try {
    return optionalRecord(JSON.parse(text) as unknown) ?? {};
  } catch {
    if (response.ok) throw new ProviderRequestError(502, "Anymail Finder returned malformed JSON");
    return { message: text };
  }
}

function wrapResult(payload: Record<string, unknown>): Record<string, unknown> {
  return { result: payload, raw: payload };
}

function readString(input: Record<string, unknown>, key: string): string {
  const value = optionalString(input[key]);
  if (value) return value;
  throw new ProviderRequestError(502, `Anymail Finder response is missing ${key}`);
}

function readNumber(input: Record<string, unknown>, key: string): number {
  const value = input[key];
  if (typeof value === "number" && Number.isFinite(value)) return value;
  throw new ProviderRequestError(502, `Anymail Finder response is missing ${key}`);
}
