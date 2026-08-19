import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { optionalRecord, optionalString } from "../../core/cast.ts";
import {
  createProviderTimeout,
  defineApiKeyProviderExecutors,
  defineProviderProxy,
  providerUserAgent,
  ProviderRequestError,
  readProviderTextBody,
} from "../provider-runtime.ts";

const service = "datagma";
const datagmaApiBaseUrl = "https://gateway.datagma.net";
const datagmaDefaultRequestTimeoutMs = 60_000;
const datagmaMaxResponseBytes = 10 * 1024 * 1024;

type DatagmaPhase = "validate" | "execute";
type DatagmaActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

const datagmaActionHandlers: ProviderActionHandlers<"datagma", DatagmaActionHandler> = {
  get_credit(input, context) {
    return requestDatagmaResult({
      path: "/api/ingress/v1/mine",
      apiKey: context.apiKey,
      query: [["email", input.email]],
      fetcher: context.fetcher,
      signal: context.signal,
      phase: "execute",
    });
  },
  enrich_person_or_company(input, context) {
    validateEnrichInput(input);
    return requestDatagmaResult({
      path: "/api/ingress/v2/full",
      apiKey: context.apiKey,
      query: queryEntries(input, [
        "data",
        "firstName",
        "lastName",
        "fullName",
        "company",
        "companyKeyword",
        "countryCode",
        "companyPremium",
        "companyFull",
        "companyFrench",
        "personFull",
        "phoneFull",
        "deepTraffic",
        "debug",
        "whatsappCheck",
      ]),
      fetcher: context.fetcher,
      signal: context.signal,
      phase: "execute",
    });
  },
  find_work_email(input, context) {
    validateFindWorkEmailInput(input);
    return requestDatagmaResult({
      path: "/api/ingress/v8/findEmail",
      apiKey: context.apiKey,
      query: queryEntries(input, ["firstName", "lastName", "fullName", "company", "linkedInSlug"]),
      fetcher: context.fetcher,
      signal: context.signal,
      phase: "execute",
    });
  },
  search_phone_numbers(input, context) {
    if (input.email === undefined && input.username === undefined) {
      throw invalidInput("Provide at least one of email or username");
    }
    return requestDatagmaResult({
      path: "/api/ingress/v1/search",
      apiKey: context.apiKey,
      query: queryEntries(input, ["email", "username", "minimumMatch", "whatsappCheck"]),
      fetcher: context.fetcher,
      signal: context.signal,
      phase: "execute",
    });
  },
  detect_job_change(input, context) {
    validateDetectJobChangeInput(input);
    return requestDatagmaResult({
      path: "/api/ingress/v4/update",
      apiKey: context.apiKey,
      query: queryEntries(input, ["firstName", "lastName", "fullName", "companyName", "jobTitle"]),
      fetcher: context.fetcher,
      signal: context.signal,
      phase: "execute",
    });
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, datagmaActionHandlers, {
  skipDnsValidation: true,
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: datagmaApiBaseUrl,
  auth: { type: "api_key_query", name: "apiId" },
  skipDnsValidation: true,
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const result = await requestDatagma({
      path: "/api/ingress/v1/mine",
      apiKey: input.apiKey,
      query: [],
      fetcher,
      signal,
      phase: "validate",
    });
    const creditBalance = readCreditBalance(result);
    return {
      profile: {
        accountId: "api_key",
        displayName: "Datagma API Key",
      },
      grantedScopes: [],
      metadata: {
        apiBaseUrl: datagmaApiBaseUrl,
        validationEndpoint: "/api/ingress/v1/mine",
        ...(creditBalance === undefined ? {} : { creditBalance }),
      },
    };
  },
};

async function requestDatagmaResult(input: {
  path: string;
  apiKey: string;
  query: Array<[string, unknown]>;
  fetcher: typeof fetch;
  signal?: AbortSignal;
  phase: DatagmaPhase;
}) {
  return {
    result: await requestDatagma(input),
  };
}

async function requestDatagma(input: {
  path: string;
  apiKey: string;
  query: Array<[string, unknown]>;
  fetcher: typeof fetch;
  signal?: AbortSignal;
  phase: DatagmaPhase;
}) {
  const url = new URL(input.path, datagmaApiBaseUrl);
  url.searchParams.set("apiId", input.apiKey);
  for (const [name, value] of input.query) {
    appendQueryValue(url, name, value);
  }

  const timeoutHandle = createProviderTimeout(input.signal, datagmaDefaultRequestTimeoutMs);
  try {
    const response = await input.fetcher(url.toString(), {
      method: "GET",
      headers: {
        accept: "application/json",
        "user-agent": providerUserAgent,
      },
      signal: timeoutHandle.signal,
    });
    const payload = await readDatagmaPayload(response);

    if (!response.ok) {
      throw createDatagmaError(response.status, payload, input.phase);
    }

    return payload;
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }

    if (timeoutHandle.didTimeout()) {
      throw new ProviderRequestError(504, "Datagma request timed out");
    }

    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Datagma request failed: ${error.message}` : "Datagma request failed",
    );
  } finally {
    timeoutHandle.cleanup();
  }
}

function queryEntries(input: Record<string, unknown>, names: string[]) {
  return names.map((name) => [name, input[name]] as [string, unknown]);
}

function appendQueryValue(url: URL, name: string, value: unknown) {
  if (value === undefined || value === null || value === "") {
    return;
  }

  url.searchParams.set(name, typeof value === "string" ? value.trim() : String(value));
}

async function readDatagmaPayload(response: Response) {
  const text = await readProviderTextBody(response, "Datagma response", datagmaMaxResponseBytes);
  if (text.trim() === "") {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "Datagma returned invalid JSON");
  }
}

function createDatagmaError(status: number, payload: unknown, phase: DatagmaPhase) {
  const message = extractDatagmaErrorMessage(payload) ?? `Datagma request failed with status ${status}`;

  if (status === 429) {
    return new ProviderRequestError(429, message);
  }

  if (phase === "validate" && status >= 400 && status < 500) {
    return new ProviderRequestError(401, message);
  }

  if (phase === "execute" && (status === 401 || status === 403)) {
    return new ProviderRequestError(401, message);
  }

  if (phase === "execute" && status >= 400 && status < 500) {
    return new ProviderRequestError(status, message);
  }

  return new ProviderRequestError(status >= 500 || status < 400 ? 502 : status, message);
}

function extractDatagmaErrorMessage(payload: unknown) {
  if (typeof payload === "string" && payload.trim() !== "") {
    return payload;
  }

  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }

  return optionalString(record.message)?.trim() || optionalString(record.error)?.trim();
}

function readCreditBalance(payload: unknown) {
  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }

  for (const name of ["credit", "credits", "creditBalance", "balance"]) {
    const value = record[name];
    if (typeof value === "number" || typeof value === "string") {
      return value;
    }
  }

  return undefined;
}

function validateEnrichInput(input: Record<string, unknown>): void {
  if (
    input.data === undefined &&
    !(
      input.company !== undefined &&
      (input.fullName !== undefined || (input.firstName !== undefined && input.lastName !== undefined))
    )
  ) {
    throw invalidInput("Provide data, or provide company with fullName or firstName and lastName");
  }
}

function validateFindWorkEmailInput(input: Record<string, unknown>): void {
  const hasName = input.fullName !== undefined || (input.firstName !== undefined && input.lastName !== undefined);
  if (!hasName || (input.company === undefined && input.linkedInSlug === undefined)) {
    throw invalidInput("Provide fullName or firstName and lastName, plus either company or linkedInSlug");
  }
}

function validateDetectJobChangeInput(input: Record<string, unknown>): void {
  const hasName = input.fullName !== undefined || (input.firstName !== undefined && input.lastName !== undefined);
  if (input.companyName === undefined || !hasName) {
    throw invalidInput("Provide companyName with fullName or firstName and lastName");
  }
}

function invalidInput(message: string): ProviderRequestError {
  return new ProviderRequestError(400, message);
}
