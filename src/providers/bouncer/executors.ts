import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import {
  compactObject,
  optionalBoolean,
  optionalNumber,
  optionalRecord,
  optionalString,
  requiredString,
  stringArray,
} from "../../core/cast.ts";
import {
  createProviderTimeout,
  defineApiKeyProviderExecutors,
  defineProviderProxy,
  isAbortLikeError,
  ProviderRequestError,
  providerUserAgent,
} from "../provider-runtime.ts";

const service = "bouncer";
const bouncerApiBaseUrl = "https://api.usebouncer.com";
const bouncerDefaultRequestTimeoutMs = 30_000;

type BouncerRequestPhase = "validate" | "execute";
type BouncerActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

export const bouncerActionHandlers: Record<string, BouncerActionHandler> = {
  get_credits(_input, context) {
    return requestBouncerCredits({
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      signal: context.signal,
      phase: "execute",
    });
  },
  verify_email(input, context) {
    return requestBouncerVerifyEmail({
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      signal: context.signal,
      phase: "execute",
      email: requiredString(input.email, "email", invalidInputError),
    });
  },
  verify_domain(input, context) {
    return requestBouncerVerifyDomain({
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      signal: context.signal,
      phase: "execute",
      domain: requiredString(input.domain, "domain", invalidInputError),
    });
  },
  verify_emails_batch_sync(input, context) {
    return requestBouncerVerifyEmailsBatchSync({
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      signal: context.signal,
      phase: "execute",
      emails: stringArray(input.emails, "emails", invalidInputError),
    });
  },
  create_batch_request(input, context) {
    return requestBouncerCreateBatchRequest({
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      signal: context.signal,
      phase: "execute",
      emails: stringArray(input.emails, "emails", invalidInputError),
      callbackUrl: optionalString(input.callbackUrl),
    });
  },
  get_batch_status(input, context) {
    return requestBouncerBatchStatus({
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      signal: context.signal,
      phase: "execute",
      batchId: requiredString(input.batchId, "batchId", invalidInputError),
      includeStats: optionalBoolean(input.includeStats) === true,
    });
  },
  finish_batch(input, context) {
    return requestBouncerFinishBatch({
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      signal: context.signal,
      phase: "execute",
      batchId: requiredString(input.batchId, "batchId", invalidInputError),
    });
  },
  get_batch_results(input, context) {
    return requestBouncerBatchResults({
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      signal: context.signal,
      phase: "execute",
      batchId: requiredString(input.batchId, "batchId", invalidInputError),
      download: optionalString(input.download),
    });
  },
  delete_batch_request(input, context) {
    return requestBouncerDeleteBatchRequest({
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      signal: context.signal,
      phase: "execute",
      batchId: requiredString(input.batchId, "batchId", invalidInputError),
    });
  },
  create_toxicity_list_job(input, context) {
    return requestBouncerCreateToxicityListJob({
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      signal: context.signal,
      phase: "execute",
      emails: stringArray(input.emails, "emails", invalidInputError),
    });
  },
  get_toxicity_list_job_status(input, context) {
    return requestBouncerToxicityListJobStatus({
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      signal: context.signal,
      phase: "execute",
      id: requiredString(input.id, "id", invalidInputError),
    });
  },
  get_toxicity_list_results(input, context) {
    return requestBouncerToxicityListResults({
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      signal: context.signal,
      phase: "execute",
      id: requiredString(input.id, "id", invalidInputError),
    });
  },
  delete_toxicity_list_job(input, context) {
    return requestBouncerDeleteToxicityListJob({
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      signal: context.signal,
      phase: "execute",
      id: requiredString(input.id, "id", invalidInputError),
    });
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, bouncerActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const payload = await requestBouncerCredits({
      apiKey: input.apiKey,
      fetcher,
      signal,
      phase: "validate",
    });

    return {
      profile: {
        accountId: service,
        displayName: "Bouncer API Key",
      },
      grantedScopes: [],
      metadata: {
        apiBaseUrl: bouncerApiBaseUrl,
        validationEndpoint: "/v1.1/credits",
        credits: payload.credits,
      },
    };
  },
};

async function requestBouncerCredits(input: BouncerBaseRequestInput): Promise<{ credits: number }> {
  const payload = await requestBouncerJson({
    path: "/v1.1/credits",
    apiKey: input.apiKey,
    fetcher: input.fetcher,
    signal: input.signal,
    phase: input.phase,
  });
  const record = requireBouncerObject(payload, "/v1.1/credits");
  const credits = optionalNumber(record.credits);
  if (credits == null || !Number.isInteger(credits) || credits < 0) {
    throw new ProviderRequestError(502, "bouncer /v1.1/credits returned invalid credits");
  }

  return { credits };
}

interface BouncerBaseRequestInput {
  apiKey: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
  phase: BouncerRequestPhase;
}

async function requestBouncerVerifyEmail(
  input: BouncerBaseRequestInput & { email: string },
): Promise<Record<string, unknown>> {
  const payload = await requestBouncerJson({
    path: "/v1.1/email/verify",
    apiKey: input.apiKey,
    fetcher: input.fetcher,
    signal: input.signal,
    phase: input.phase,
    query: {
      email: input.email,
      timeout: String(bouncerDefaultRequestTimeoutMs / 1000),
    },
  });

  return normalizeBouncerVerifyEmail(payload, "/v1.1/email/verify");
}

async function requestBouncerVerifyDomain(
  input: BouncerBaseRequestInput & { domain: string },
): Promise<Record<string, unknown>> {
  const payload = await requestBouncerJson({
    path: "/v1.1/domain",
    apiKey: input.apiKey,
    fetcher: input.fetcher,
    signal: input.signal,
    phase: input.phase,
    query: {
      domain: input.domain,
    },
  });

  return normalizeBouncerVerifyDomain(payload);
}

async function requestBouncerVerifyEmailsBatchSync(
  input: BouncerBaseRequestInput & { emails: string[] },
): Promise<Record<string, unknown>> {
  const payload = await requestBouncerJson({
    path: "/v1.1/email/verify/batch/sync",
    method: "POST",
    apiKey: input.apiKey,
    fetcher: input.fetcher,
    signal: input.signal,
    phase: input.phase,
    body: JSON.stringify(input.emails),
  });

  return {
    results: normalizeBouncerVerifyEmailList(payload, "/v1.1/email/verify/batch/sync"),
  };
}

async function requestBouncerCreateBatchRequest(
  input: BouncerBaseRequestInput & { emails: string[]; callbackUrl?: string },
): Promise<Record<string, unknown>> {
  const payload = await requestBouncerJson({
    path: "/v1.1/email/verify/batch",
    method: "POST",
    apiKey: input.apiKey,
    fetcher: input.fetcher,
    signal: input.signal,
    phase: input.phase,
    body: JSON.stringify(input.emails.map((email) => ({ email }))),
    query: {
      callback: input.callbackUrl,
    },
  });

  const record = requireBouncerObject(payload, "/v1.1/email/verify/batch");
  const batchId = optionalString(record.batchId);
  if (!batchId) {
    throw new ProviderRequestError(502, "bouncer /v1.1/email/verify/batch returned invalid batchId");
  }

  return {
    batchId,
    created: true,
  };
}

async function requestBouncerBatchStatus(
  input: BouncerBaseRequestInput & { batchId: string; includeStats: boolean },
): Promise<Record<string, unknown>> {
  const payload = await requestBouncerJson({
    path: `/v1.1/email/verify/batch/${input.batchId}`,
    apiKey: input.apiKey,
    fetcher: input.fetcher,
    signal: input.signal,
    phase: input.phase,
    query: {
      "with-stats": input.includeStats ? "true" : undefined,
    },
  });

  return normalizeBouncerBatchStatus(payload, "/v1.1/email/verify/batch");
}

async function requestBouncerFinishBatch(
  input: BouncerBaseRequestInput & { batchId: string },
): Promise<Record<string, unknown>> {
  await requestBouncerJson({
    path: `/v1.1/email/verify/batch/${input.batchId}/finish`,
    method: "POST",
    apiKey: input.apiKey,
    fetcher: input.fetcher,
    signal: input.signal,
    phase: input.phase,
  });

  return {
    batchId: input.batchId,
    finishRequested: true,
  };
}

async function requestBouncerBatchResults(
  input: BouncerBaseRequestInput & { batchId: string; download?: string },
): Promise<Record<string, unknown>> {
  const payload = await requestBouncerJson({
    path: `/v1.1/email/verify/batch/${input.batchId}/download`,
    apiKey: input.apiKey,
    fetcher: input.fetcher,
    signal: input.signal,
    phase: input.phase,
    query: {
      download: input.download,
    },
  });

  return {
    batchId: input.batchId,
    download: input.download ?? "all",
    results: normalizeBouncerVerifyEmailList(payload, `/v1.1/email/verify/batch/${input.batchId}/download`),
  };
}

async function requestBouncerDeleteBatchRequest(
  input: BouncerBaseRequestInput & { batchId: string },
): Promise<Record<string, unknown>> {
  await requestBouncerJson({
    path: `/v1.1/email/verify/batch/${input.batchId}`,
    method: "DELETE",
    apiKey: input.apiKey,
    fetcher: input.fetcher,
    signal: input.signal,
    phase: input.phase,
  });

  return {
    batchId: input.batchId,
    deleted: true,
  };
}

async function requestBouncerCreateToxicityListJob(
  input: BouncerBaseRequestInput & { emails: string[] },
): Promise<Record<string, unknown>> {
  const payload = await requestBouncerJson({
    path: "/v1/toxicity/list",
    method: "POST",
    apiKey: input.apiKey,
    fetcher: input.fetcher,
    signal: input.signal,
    phase: input.phase,
    body: JSON.stringify(input.emails),
  });

  return normalizeBouncerToxicityJob(payload, "/v1/toxicity/list");
}

async function requestBouncerToxicityListJobStatus(
  input: BouncerBaseRequestInput & { id: string },
): Promise<Record<string, unknown>> {
  const payload = await requestBouncerJson({
    path: `/v1/toxicity/list/${input.id}`,
    apiKey: input.apiKey,
    fetcher: input.fetcher,
    signal: input.signal,
    phase: input.phase,
  });

  return normalizeBouncerToxicityJob(payload, `/v1/toxicity/list/${input.id}`);
}

async function requestBouncerToxicityListResults(
  input: BouncerBaseRequestInput & { id: string },
): Promise<Record<string, unknown>> {
  const payload = await requestBouncerJson({
    path: `/v1/toxicity/list/${input.id}/data`,
    apiKey: input.apiKey,
    fetcher: input.fetcher,
    signal: input.signal,
    phase: input.phase,
  });

  return {
    id: input.id,
    results: normalizeBouncerToxicityResults(payload, `/v1/toxicity/list/${input.id}/data`),
  };
}

async function requestBouncerDeleteToxicityListJob(
  input: BouncerBaseRequestInput & { id: string },
): Promise<Record<string, unknown>> {
  await requestBouncerJson({
    path: `/v1/toxicity/list/${input.id}`,
    method: "DELETE",
    apiKey: input.apiKey,
    fetcher: input.fetcher,
    signal: input.signal,
    phase: input.phase,
  });

  return {
    id: input.id,
    deleted: true,
  };
}

async function requestBouncerJson(input: {
  path: string;
  method?: "DELETE" | "GET" | "POST";
  apiKey: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
  phase: BouncerRequestPhase;
  body?: string;
  query?: Record<string, string | undefined>;
}): Promise<unknown> {
  const url = new URL(input.path, bouncerApiBaseUrl);
  for (const [key, value] of Object.entries(input.query ?? {})) {
    if (value) {
      url.searchParams.set(key, value);
    }
  }

  const timeout = createProviderTimeout(input.signal, bouncerDefaultRequestTimeoutMs);
  try {
    const headers: Record<string, string> = {
      accept: "application/json",
      "user-agent": providerUserAgent,
      "x-api-key": input.apiKey,
    };
    if (input.body) {
      headers["content-type"] = "application/json";
    }

    const response = await input.fetcher(url.toString(), {
      method: input.method ?? "GET",
      headers,
      body: input.body,
      signal: timeout.signal,
    });
    const payload = await readBouncerPayload(response);
    if (!response.ok) {
      throw mapBouncerError(response.status, payload, input.phase);
    }
    return payload;
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    if (timeout.didTimeout() && isAbortLikeError(error)) {
      throw new ProviderRequestError(504, "Bouncer request timed out");
    }

    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Bouncer request failed: ${error.message}` : "Bouncer request failed",
    );
  } finally {
    timeout.cleanup();
  }
}

async function readBouncerPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return undefined;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function mapBouncerError(status: number, payload: unknown, phase: BouncerRequestPhase): ProviderRequestError {
  const message = extractBouncerErrorMessage(payload) ?? `Bouncer request failed with ${status}`;
  if (status === 401 || status === 403) {
    return new ProviderRequestError(phase === "validate" ? 400 : status, message, payload);
  }
  return new ProviderRequestError(status || 500, message, payload);
}

function extractBouncerErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim()) {
    return payload.trim();
  }

  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }

  return optionalString(record.message) ?? optionalString(record.error);
}

function requireBouncerObject(payload: unknown, endpoint: string): Record<string, unknown> {
  const record = optionalRecord(payload);
  if (!record) {
    throw new ProviderRequestError(502, `bouncer response for ${endpoint} was not a JSON object`);
  }
  return record;
}

function normalizeBouncerVerifyEmail(payload: unknown, endpoint: string): Record<string, unknown> {
  const record = requireBouncerObject(payload, endpoint);
  const email = optionalString(record.email);
  const status = parseVerificationStatus(record.status, endpoint, "status");
  const reason = optionalString(record.reason);
  const score = optionalNumber(record.score);
  const toxic = parseTriState(record.toxic, endpoint, "toxic");

  if (!email || !reason || !Number.isInteger(score)) {
    throw new ProviderRequestError(502, `bouncer ${endpoint} returned invalid core fields`);
  }

  return compactObject({
    email,
    status,
    reason,
    score,
    toxic,
    domain: normalizeDomainInfo(record.domain, endpoint),
    account: normalizeAccountInfo(record.account, endpoint),
    dns: normalizeDnsInfo(record.dns, endpoint),
    provider: optionalString(record.provider),
    toxicity: normalizeOptionalToxicity(record.toxicity, endpoint),
  });
}

function normalizeBouncerVerifyDomain(payload: unknown): Record<string, unknown> {
  const record = requireBouncerObject(payload, "/v1.1/domain");
  const domain = normalizeDomainInfo(record.domain, "/v1.1/domain");
  const dns = normalizeDnsInfo(record.dns, "/v1.1/domain");
  const provider = optionalString(record.provider);
  const toxic = parseTriState(record.toxic, "/v1.1/domain", "toxic");

  if (!domain || !dns || !provider) {
    throw new ProviderRequestError(502, "bouncer /v1.1/domain returned invalid fields");
  }

  return {
    domain,
    dns,
    provider,
    toxic,
  };
}

function normalizeBouncerVerifyEmailList(payload: unknown, endpoint: string): Array<Record<string, unknown>> {
  if (!Array.isArray(payload)) {
    throw new ProviderRequestError(502, `bouncer ${endpoint} response was not an array`);
  }

  return payload.map((item) => normalizeBouncerVerifyEmail(item, endpoint));
}

function normalizeBouncerBatchStatus(payload: unknown, endpoint: string): Record<string, unknown> {
  const record = requireBouncerObject(payload, endpoint);
  const batchId = optionalString(record.batchId);
  const status = optionalString(record.status);
  if (!batchId) {
    throw new ProviderRequestError(502, `bouncer ${endpoint} returned invalid batchId`);
  }
  if (!status) {
    throw new ProviderRequestError(502, `bouncer ${endpoint} returned invalid status`);
  }

  return compactObject({
    batchId,
    status,
    processed: normalizeOptionalNonnegativeInteger(record.processed, endpoint, "processed"),
    credits: normalizeOptionalNonnegativeInteger(record.credits, endpoint, "credits"),
    stats: normalizeBatchStats(record.stats, endpoint),
  });
}

function normalizeBatchStats(value: unknown, endpoint: string): Record<string, number> | undefined {
  const record = optionalRecord(value);
  if (!record) {
    return undefined;
  }

  return {
    deliverable: normalizeRequiredNonnegativeInteger(record.deliverable, endpoint, "stats.deliverable"),
    risky: normalizeRequiredNonnegativeInteger(record.risky, endpoint, "stats.risky"),
    undeliverable: normalizeRequiredNonnegativeInteger(record.undeliverable, endpoint, "stats.undeliverable"),
    unknown: normalizeRequiredNonnegativeInteger(record.unknown, endpoint, "stats.unknown"),
  };
}

function normalizeBouncerToxicityJob(payload: unknown, endpoint: string): Record<string, unknown> {
  const record = requireBouncerObject(payload, endpoint);
  const id = optionalString(record.id);
  const status = optionalString(record.status);
  if (!id) {
    throw new ProviderRequestError(502, `bouncer ${endpoint} returned invalid id`);
  }
  if (!status) {
    throw new ProviderRequestError(502, `bouncer ${endpoint} returned invalid status`);
  }

  return compactObject({
    id,
    status,
    processed: normalizeOptionalNonnegativeInteger(record.processed, endpoint, "processed"),
  });
}

function normalizeBouncerToxicityResults(payload: unknown, endpoint: string): Array<Record<string, unknown>> {
  if (!Array.isArray(payload)) {
    throw new ProviderRequestError(502, `bouncer ${endpoint} response was not an array`);
  }

  return payload.map((item) => {
    const record = requireBouncerObject(item, endpoint);
    const email = optionalString(record.email);
    const toxicity = normalizeRequiredNonnegativeInteger(record.toxicity, endpoint, "toxicity");
    if (!email) {
      throw new ProviderRequestError(502, `bouncer ${endpoint} returned invalid email`);
    }

    return {
      email,
      toxicity,
    };
  });
}

function normalizeDomainInfo(value: unknown, endpoint: string): Record<string, unknown> | undefined {
  const record = optionalRecord(value);
  if (!record) {
    return undefined;
  }

  const name = optionalString(record.name);
  const acceptAll = parseTriState(record.acceptAll, endpoint, "domain.acceptAll");
  const disposable = parseTriState(record.disposable, endpoint, "domain.disposable");
  const free = parseTriState(record.free, endpoint, "domain.free");
  if (!name) {
    throw new ProviderRequestError(502, `bouncer ${endpoint} returned invalid domain.name`);
  }

  return {
    name,
    acceptAll,
    disposable,
    free,
  };
}

function normalizeAccountInfo(value: unknown, endpoint: string): Record<string, unknown> | undefined {
  const record = optionalRecord(value);
  if (!record) {
    return undefined;
  }

  return {
    role: parseTriState(record.role, endpoint, "account.role"),
    disabled: parseTriState(record.disabled, endpoint, "account.disabled"),
    fullMailbox: parseTriState(record.fullMailbox, endpoint, "account.fullMailbox"),
  };
}

function normalizeDnsInfo(value: unknown, endpoint: string): Record<string, unknown> | undefined {
  const record = optionalRecord(value);
  if (!record) {
    return undefined;
  }

  const type = optionalString(record.type);
  if (!type) {
    throw new ProviderRequestError(502, `bouncer ${endpoint} returned invalid dns.type`);
  }

  return compactObject({
    type,
    record: optionalString(record.record),
  });
}

function normalizeOptionalToxicity(value: unknown, endpoint: string): number | undefined {
  if (value == null) {
    return undefined;
  }
  const parsed = optionalNumber(value);
  if (parsed == null || !Number.isInteger(parsed) || parsed < 0 || parsed > 5) {
    throw new ProviderRequestError(502, `bouncer ${endpoint} returned invalid toxicity`);
  }
  return parsed;
}

function normalizeOptionalNonnegativeInteger(value: unknown, endpoint: string, fieldName: string): number | undefined {
  if (value == null) {
    return undefined;
  }

  return normalizeRequiredNonnegativeInteger(value, endpoint, fieldName);
}

function normalizeRequiredNonnegativeInteger(value: unknown, endpoint: string, fieldName: string): number {
  const parsed = optionalNumber(value);
  if (parsed == null || !Number.isInteger(parsed) || parsed < 0) {
    throw new ProviderRequestError(502, `bouncer ${endpoint} returned invalid ${fieldName}`);
  }

  return parsed;
}

function parseVerificationStatus(value: unknown, endpoint: string, fieldName: string): string {
  if (value === "deliverable" || value === "risky" || value === "undeliverable" || value === "unknown") {
    return value;
  }

  throw new ProviderRequestError(502, `bouncer ${endpoint} returned invalid ${fieldName}`);
}

function parseTriState(value: unknown, endpoint: string, fieldName: string): string {
  if (value === "yes" || value === "no" || value === "unknown") {
    return value;
  }

  throw new ProviderRequestError(502, `bouncer ${endpoint} returned invalid ${fieldName}`);
}

function invalidInputError(message: string): ProviderRequestError {
  return new ProviderRequestError(400, message);
}

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: "https://api.usebouncer.com",
  auth: { type: "api_key_header", name: "x-api-key" },
});
