import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";
import type { FaradayActionName } from "./actions.ts";

import { optionalRecord, optionalString } from "../../core/cast.ts";
import { defineApiKeyProviderExecutors, providerUserAgent, ProviderRequestError } from "../provider-runtime.ts";

const service = "faraday";
const faradayApiBaseUrl = "https://api.faraday.ai/v1";

interface FaradayActionContext {
  apiKey: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

type FaradayActionHandler = (input: Record<string, unknown>, context: FaradayActionContext) => Promise<unknown>;

export const faradayActionHandlers: Record<FaradayActionName, FaradayActionHandler> = {
  async get_current_account(_input, context) {
    const account = await requestFaradayObject("/accounts/current", context);
    return {
      account,
      raw: account,
    };
  },
  async list_accounts(_input, context) {
    const accounts = await requestFaradayArray("/accounts", context);
    return {
      accounts,
      raw: accounts,
    };
  },
  async get_account(input, context) {
    const account = await requestFaradayObject(`/accounts/${encodePathSegment(input.account_id)}`, context);
    return {
      account,
      raw: account,
    };
  },
  async list_scopes(_input, context) {
    const scopes = await requestFaradayArray("/scopes", context);
    return {
      scopes,
      raw: scopes,
    };
  },
  async get_scope(input, context) {
    const scope = await requestFaradayObject(`/scopes/${encodePathSegment(input.scope_id)}`, context);
    return {
      scope,
      raw: scope,
    };
  },
  async list_datasets(_input, context) {
    const datasets = await requestFaradayArray("/datasets", context);
    return {
      datasets,
      raw: datasets,
    };
  },
  async get_dataset(input, context) {
    const dataset = await requestFaradayObject(`/datasets/${encodePathSegment(input.dataset_id)}`, context);
    return {
      dataset,
      raw: dataset,
    };
  },
  async list_traits(_input, context) {
    const traits = await requestFaradayArray("/traits", context);
    return {
      traits,
      raw: traits,
    };
  },
  async get_trait(input, context) {
    const trait = await requestFaradayObject(`/traits/${encodePathSegment(input.trait_id)}`, context);
    return {
      trait,
      raw: trait,
    };
  },
  async list_targets(_input, context) {
    const targets = await requestFaradayArray("/targets", context);
    return {
      targets,
      raw: targets,
    };
  },
  async get_target(input, context) {
    const target = await requestFaradayObject(`/targets/${encodePathSegment(input.target_id)}`, context);
    return {
      target,
      raw: target,
    };
  },
  async list_usages(_input, context) {
    const usages = await requestFaradayArray("/usages", context);
    return {
      usages,
      raw: usages,
    };
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, faradayActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const account = await requestFaradayObject("/accounts/current", {
      apiKey: input.apiKey,
      fetcher,
      signal,
    });
    const accountId = optionalString(account.id);
    const accountName = optionalString(account.name);

    return {
      profile: {
        accountId: accountId ?? "api_key",
        displayName: accountName ?? "Faraday API Key",
      },
      grantedScopes: [],
      metadata: {
        apiBaseUrl: faradayApiBaseUrl,
        validationEndpoint: "/accounts/current",
        accountId,
        accountName,
      },
    };
  },
};

async function requestFaradayArray(
  path: string,
  context: FaradayActionContext,
): Promise<Array<Record<string, unknown>>> {
  const payload = await requestFaraday(path, context);
  if (!Array.isArray(payload)) {
    throw new ProviderRequestError(502, "faraday returned a non-array JSON response");
  }
  return payload.map((item) => {
    const record = optionalRecord(item);
    if (!record) {
      throw new ProviderRequestError(502, "faraday returned a non-object item in the JSON array");
    }
    return record;
  });
}

async function requestFaradayObject(path: string, context: FaradayActionContext): Promise<Record<string, unknown>> {
  const payload = await requestFaraday(path, context);
  const record = optionalRecord(payload);
  if (!record) {
    throw new ProviderRequestError(502, "faraday returned a non-object JSON response");
  }
  return record;
}

async function requestFaraday(path: string, context: FaradayActionContext): Promise<unknown> {
  const url = new URL(path.startsWith("/") ? path.slice(1) : path, `${faradayApiBaseUrl}/`);
  let response: Response;
  let payload: unknown;

  try {
    response = await context.fetcher(url, {
      method: "GET",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${context.apiKey}`,
        "user-agent": providerUserAgent,
      },
      signal: context.signal,
    });
    payload = await readFaradayJson(response);
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    throw new ProviderRequestError(
      502,
      `faraday request failed: ${error instanceof Error ? error.message : "Unknown transport error"}`,
    );
  }

  if (!response.ok) {
    throw mapFaradayError(response.status, payload);
  }

  return payload;
}

async function readFaradayJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "faraday returned malformed JSON");
  }
}

function mapFaradayError(status: number, payload: unknown): ProviderRequestError {
  const message = readFaradayErrorMessage(payload) ?? `faraday request failed with ${status || 500}`;
  if (status === 400 || status === 409) {
    return new ProviderRequestError(400, message, payload);
  }
  if (status === 401 || status === 403) {
    return new ProviderRequestError(401, message, payload);
  }
  if (status === 404) {
    return new ProviderRequestError(404, message, payload);
  }
  if (status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  return new ProviderRequestError(status || 500, message, payload);
}

function readFaradayErrorMessage(payload: unknown): string | undefined {
  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }

  return optionalString(record.note) ?? optionalString(record.message) ?? optionalString(record.error);
}

function encodePathSegment(value: unknown): string {
  const stringValue = optionalString(value);
  if (!stringValue) {
    throw new ProviderRequestError(400, "Faraday resource ID is required");
  }
  return encodeURIComponent(stringValue);
}
