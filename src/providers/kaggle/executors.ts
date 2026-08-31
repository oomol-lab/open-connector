import type {
  CredentialValidationResult,
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";

import { Buffer } from "node:buffer";
import { optionalBoolean, optionalInteger, optionalRecord, optionalString, requiredRecord } from "../../core/cast.ts";
import {
  defineProviderExecutors,
  defineProviderProxy,
  ProviderRequestError,
  providerUserAgent,
  requireApiKeyCredential,
} from "../provider-runtime.ts";

const service = "kaggle";
const kaggleApiBaseUrl = "https://www.kaggle.com/api/v1";
const kaggleValidationPath = "/competitions/list";

type KaggleRequestPhase = "validate" | "execute";
type QueryValue = string | number | boolean | undefined;

interface KaggleContext {
  apiKey: string;
  username: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

interface KaggleRequestInput {
  path: string;
  query?: Record<string, QueryValue>;
  phase: KaggleRequestPhase;
}

interface NormalizedListPayload {
  items: Array<Record<string, unknown>>;
  nextPageToken?: string;
}

type KaggleActionHandler = (input: Record<string, unknown>, context: KaggleContext) => Promise<unknown>;

const kaggleActionHandlers: ProviderActionHandlers<"kaggle", KaggleActionHandler> = {
  list_competitions(input, context) {
    return executeListCompetitions(input, context);
  },
  list_datasets(input, context) {
    return executeListDatasets(input, context);
  },
  list_kernels(input, context) {
    return executeListKernels(input, context);
  },
  list_models(input, context) {
    return executeListModels(input, context);
  },
};

export const executors: ProviderExecutors = defineProviderExecutors<KaggleContext>({
  service,
  handlers: kaggleActionHandlers,
  skipDnsValidation: true,
  async createContext(context: ExecutionContext, fetcher: typeof fetch): Promise<KaggleContext> {
    const credential = await requireApiKeyCredential(context, service);
    const kaggleContext: KaggleContext = {
      apiKey: credential.apiKey,
      username: normalizeKaggleUsername(credential.values.username ?? credential.metadata.username),
      fetcher,
    };
    if (context.signal) {
      kaggleContext.signal = context.signal;
    }
    return kaggleContext;
  },
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  async baseUrl(context) {
    // Reject an unusable credential before header normalization, keeping the 401/400 precedence.
    const credential = await requireApiKeyCredential(context, service);
    normalizeKaggleUsername(credential.values.username ?? credential.metadata.username);
    return kaggleApiBaseUrl;
  },
  auth: { type: "none" },
  async customizeRequest({ context, headers }) {
    const credential = await requireApiKeyCredential(context, service);
    const username = normalizeKaggleUsername(credential.values.username ?? credential.metadata.username);
    headers.set("accept", "application/json");
    headers.set("authorization", buildBasicAuthHeader(username, credential.apiKey));
  },
  skipDnsValidation: true,
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }): Promise<CredentialValidationResult> {
    const username = normalizeKaggleUsername(input.values.username);
    await kaggleRequestJson(
      {
        path: kaggleValidationPath,
        query: {
          page: 1,
          pageSize: 1,
        },
        phase: "validate",
      },
      {
        apiKey: input.apiKey,
        username,
        fetcher,
        signal,
      },
    );

    return {
      profile: {
        accountId: `kaggle:${username}`,
        displayName: `Kaggle (${username})`,
      },
      grantedScopes: [],
      metadata: {
        apiBaseUrl: kaggleApiBaseUrl,
        username,
        validationEndpoint: kaggleValidationPath,
      },
    };
  },
};

async function executeListCompetitions(input: Record<string, unknown>, context: KaggleContext): Promise<unknown> {
  const payload = await kaggleRequestJson(
    {
      path: "/competitions/list",
      query: {
        group: optionalString(input.group),
        category: optionalString(input.category),
        sortBy: optionalString(input.sortBy),
        page: optionalInteger(input.page),
        pageSize: optionalInteger(input.pageSize),
        pageToken: optionalString(input.pageToken),
        search: optionalString(input.search),
      },
      phase: "execute",
    },
    context,
  );
  const result = normalizeListPayload(payload, "competitions");

  return {
    competitions: result.items,
    nextPageToken: result.nextPageToken,
  };
}

async function executeListDatasets(input: Record<string, unknown>, context: KaggleContext): Promise<unknown> {
  const payload = await kaggleRequestJson(
    {
      path: "/datasets/list",
      query: {
        sortBy: optionalString(input.sortBy),
        filetype: optionalString(input.fileType),
        license: optionalString(input.license),
        tag_ids: optionalStringArray(input.tagIds)?.join(","),
        search: optionalString(input.search),
        mine: optionalBoolean(input.mine),
        user: optionalString(input.user),
        page: optionalInteger(input.page),
        maxSize: optionalInteger(input.maxSize),
        minSize: optionalInteger(input.minSize),
      },
      phase: "execute",
    },
    context,
  );
  const result = normalizeListPayload(payload, "datasets");

  return {
    datasets: result.items,
    nextPageToken: result.nextPageToken,
  };
}

async function executeListKernels(input: Record<string, unknown>, context: KaggleContext): Promise<unknown> {
  const payload = await kaggleRequestJson(
    {
      path: "/kernels/list",
      query: {
        mine: optionalBoolean(input.mine),
        page: optionalInteger(input.page),
        pageSize: optionalInteger(input.pageSize),
        search: optionalString(input.search),
        parent: optionalString(input.parent),
        competition: optionalString(input.competition),
        dataset: optionalString(input.dataset),
        user: optionalString(input.user),
        language: optionalString(input.language),
        kernelType: optionalString(input.kernelType),
        outputType: optionalString(input.outputType),
        sortBy: optionalString(input.sortBy),
      },
      phase: "execute",
    },
    context,
  );
  const result = normalizeListPayload(payload, "kernels");

  return {
    kernels: result.items,
    nextPageToken: result.nextPageToken,
  };
}

async function executeListModels(input: Record<string, unknown>, context: KaggleContext): Promise<unknown> {
  const payload = await kaggleRequestJson(
    {
      path: "/models/list",
      query: {
        owner: optionalString(input.owner),
        sortBy: optionalString(input.sortBy),
        search: optionalString(input.search),
        pageSize: optionalInteger(input.pageSize),
        pageToken: optionalString(input.pageToken),
      },
      phase: "execute",
    },
    context,
  );
  const result = normalizeListPayload(payload, "models");

  return {
    models: result.items,
    nextPageToken: result.nextPageToken,
  };
}

async function kaggleRequestJson(input: KaggleRequestInput, context: KaggleContext): Promise<unknown> {
  let response: Response, payload: unknown;

  try {
    response = await context.fetcher(buildKaggleUrl(input), {
      method: "GET",
      headers: {
        accept: "application/json",
        authorization: buildBasicAuthHeader(context.username, context.apiKey),
        "user-agent": providerUserAgent,
      },
      signal: context.signal,
    });
    payload = await readJsonPayload(response);
  } catch (error) {
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Kaggle request failed: ${error.message}` : "Kaggle request failed",
    );
  }

  const embeddedErrorStatus = readEmbeddedErrorStatus(payload);
  if (!response.ok || embeddedErrorStatus !== undefined) {
    throw createKaggleError(embeddedErrorStatus ?? response.status, payload, input.phase);
  }

  return payload;
}

function buildKaggleUrl(input: KaggleRequestInput): URL {
  const path = input.path.startsWith("/") ? input.path.slice(1) : input.path;
  const url = new URL(path, `${kaggleApiBaseUrl}/`);
  for (const [key, value] of Object.entries(input.query ?? {})) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }
  return url;
}

function buildBasicAuthHeader(username: string, apiKey: string): string {
  return `Basic ${Buffer.from(`${username}:${apiKey}`).toString("base64")}`;
}

async function readJsonPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "Kaggle returned invalid JSON");
  }
}

function readEmbeddedErrorStatus(payload: unknown): number | undefined {
  const record = optionalRecord(payload);
  const code = record?.code;
  return typeof code === "number" && code >= 400 ? code : undefined;
}

function createKaggleError(status: number, payload: unknown, phase: KaggleRequestPhase): ProviderRequestError {
  const message = extractKaggleErrorMessage(payload) ?? `Kaggle request failed with ${status}`;

  if (status == 429) {
    return new ProviderRequestError(429, message, payload);
  }

  if (phase == "validate" && (status == 401 || status == 403)) {
    return new ProviderRequestError(400, message, payload);
  }

  if (phase == "execute" && (status == 401 || status == 403)) {
    return new ProviderRequestError(401, message, payload);
  }

  if (status == 400 || status == 404) {
    return new ProviderRequestError(400, message, payload);
  }

  return new ProviderRequestError(status || 500, message, payload);
}

function extractKaggleErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string") {
    return optionalString(payload);
  }
  const record = optionalRecord(payload);
  return optionalString(record?.message) ?? optionalString(record?.error);
}

function normalizeListPayload(payload: unknown, wrapperKey: string): NormalizedListPayload {
  const payloadRecord = optionalRecord(payload);
  const itemsPayload = Array.isArray(payload) ? payload : payloadRecord?.[wrapperKey];
  if (!Array.isArray(itemsPayload)) {
    throw new ProviderRequestError(502, `Kaggle response missing ${wrapperKey} list`, payload);
  }

  const nextPageToken =
    payloadRecord == null
      ? undefined
      : (optionalString(payloadRecord.nextPageToken) ?? optionalString(payloadRecord.next_page_token));

  return {
    items: itemsPayload.map((item) =>
      requiredRecord(item, `${wrapperKey}[]`, (message) => new ProviderRequestError(502, message, item)),
    ),
    nextPageToken,
  };
}

function normalizeKaggleUsername(value: unknown): string {
  const username = optionalString(value);
  if (!username) {
    throw new ProviderRequestError(400, "Kaggle username is required");
  }
  return username.toLowerCase();
}

function optionalStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const values = value.map((item) => optionalString(item)).filter((item): item is string => item !== undefined);
  return values.length > 0 ? values : undefined;
}
