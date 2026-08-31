import type { ApiKeyActionRequest, ProviderActionHandlers } from "../provider-runtime.ts";
import type { MoreTreesActionName } from "./actions.ts";

import { compactObject, optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import {
  createProviderTimeout,
  isAbortLikeError,
  ProviderRequestError,
  providerUserAgent,
} from "../provider-runtime.ts";

export interface MoreTreesCredentialCheck {
  providerAccountId?: string;
  accountLabel: string;
  providerScopes: string[];
  providerMetadata: Record<string, unknown>;
}

export const moreTreesAccountOrigin = "https://user-management-service.platform.moretrees.eco";
export const moreTreesProjectOrigin = "https://project-management-service.platform.moretrees.eco";
export const moreTreesTransactionOrigin = "https://transaction-management-service.platform.moretrees.eco";
export const moreTreesRequestTimeoutMs = 30_000;

const moreTreesAccountPath = "/user-management-api/external/accounts";
const moreTreesForestPath = "/user-management-api/external/forest";
const moreTreesProjectsPath = "/project-management-api/external/projects";
const moreTreesPlantPath = "/transaction-management-api/external/plant";

type MoreTreesRequestPhase = "validate" | "execute";
type MoreTreesActionInput = ApiKeyActionRequest & {
  actionName: MoreTreesActionName;
  input: Record<string, unknown>;
};
type MoreTreesActionHandler = (input: MoreTreesActionInput, fetcher: typeof fetch) => Promise<unknown>;

export const moreTreesActionHandlers: ProviderActionHandlers<"more_trees", MoreTreesActionHandler> = {
  get_account: executeGetAccount,
  get_forest: executeGetForest,
  list_projects: executeListProjects,
  plant_trees: executePlantTrees,
};

export async function validateMoreTreesCredential(
  input: Record<string, string>,
  fetcher: typeof fetch,
): Promise<MoreTreesCredentialCheck> {
  const apiKey = requiredString(input.apiKey, "apiKey", (message) => new ProviderRequestError(400, message)).trim();
  const accountCode = requireCredentialValue(input.accountCode, "accountCode");
  const publicValidationKey = requireCredentialValue(input.publicValidationKey, "publicValidationKey");

  const account = requireObjectResponse(
    await requestMoreTreesJson({
      url: `${moreTreesAccountOrigin}${moreTreesAccountPath}/${encodeURIComponent(accountCode)}`,
      apiKey,
      fetcher,
      phase: "validate",
    }),
    "account",
  );
  const projects = requireArrayResponse(
    await requestMoreTreesJson({
      url: `${moreTreesProjectOrigin}${moreTreesProjectsPath}`,
      apiKey: publicValidationKey,
      fetcher,
      phase: "validate",
    }),
    "projects",
  );

  const accountName = readOptionalTrimmedString(account.account_name);
  const forestName = readOptionalTrimmedString(account.forest_name);
  const forestSlug = readOptionalTrimmedString(account.forest_slug);

  return {
    providerAccountId: `more_trees:${accountCode}`,
    accountLabel: accountName ?? forestName ?? `More Trees ${accountCode}`,
    providerScopes: [],
    providerMetadata: compactObject({
      accountCode,
      forestSlug,
      validationEndpoints: [moreTreesAccountPath, moreTreesProjectsPath],
      projectCount: projects.length,
    }),
  };
}

export async function executeMoreTreesAction(input: MoreTreesActionInput, fetcher: typeof fetch): Promise<unknown> {
  const handler = moreTreesActionHandlers[input.actionName];
  if (!handler) {
    throw new ProviderRequestError(400, `unknown more_trees action: ${input.actionName}`);
  }
  return handler(input, fetcher);
}

async function executeGetAccount(input: MoreTreesActionInput, fetcher: typeof fetch) {
  const accountCode = resolveStoredAccountCode(input.providerMetadata);
  return requestMoreTreesJson({
    url: `${moreTreesAccountOrigin}${moreTreesAccountPath}/${encodeURIComponent(accountCode)}`,
    apiKey: requiredString(input.apiKey, "apiKey", (message) => new ProviderRequestError(400, message)).trim(),
    fetcher,
    phase: "execute",
  });
}

async function executeGetForest(input: MoreTreesActionInput, fetcher: typeof fetch) {
  const forestSlugOrAccountCode =
    readOptionalTrimmedString(input.input.forestSlugOrAccountCode) ?? resolveStoredAccountCode(input.providerMetadata);

  return requestMoreTreesJson({
    url: `${moreTreesAccountOrigin}${moreTreesForestPath}/${encodeURIComponent(forestSlugOrAccountCode)}`,
    fetcher,
    phase: "execute",
  });
}

async function executeListProjects(input: MoreTreesActionInput, fetcher: typeof fetch) {
  return requestMoreTreesJson({
    url: `${moreTreesProjectOrigin}${moreTreesProjectsPath}`,
    apiKey: requireStoredValidationKey(input.values),
    fetcher,
    phase: "execute",
  });
}

async function executePlantTrees(input: MoreTreesActionInput, fetcher: typeof fetch) {
  const plantForOthers = input.input.plantForOthers === true;
  validatePlantTreesInput(input.input, plantForOthers);
  return requestMoreTreesJson({
    url: `${moreTreesTransactionOrigin}${moreTreesPlantPath}`,
    method: "POST",
    apiKey: requiredString(input.apiKey, "apiKey", (message) => new ProviderRequestError(400, message)).trim(),
    body: compactObject({
      payment_account_code: resolveStoredAccountCode(input.providerMetadata),
      test: input.input.test,
      plant_for_others: plantForOthers,
      quantity: plantForOthers ? undefined : input.input.quantity,
      project_id: input.input.projectId,
      tree_id: input.input.treeId,
      recipients: plantForOthers ? buildPlantRecipients(input.input.recipients) : undefined,
    }),
    fetcher,
    phase: "execute",
  });
}

function validatePlantTreesInput(input: Record<string, unknown>, plantForOthers: boolean): void {
  if (plantForOthers) {
    if (!Array.isArray(input.recipients) || input.recipients.length === 0) {
      throw new ProviderRequestError(400, "recipients is required when plantForOthers is true");
    }
    if (input.quantity !== undefined) {
      throw new ProviderRequestError(400, "quantity must be omitted when plantForOthers is true");
    }
  } else {
    if (input.quantity === undefined) {
      throw new ProviderRequestError(400, "quantity is required when plantForOthers is false");
    }
    if (input.recipients !== undefined) {
      throw new ProviderRequestError(400, "recipients must be omitted when plantForOthers is false");
    }
  }
  if (!Array.isArray(input.recipients)) return;
  for (const recipientValue of input.recipients) {
    const recipient = optionalRecord(recipientValue);
    if (!recipient) continue;
    const hasAccountCode = readOptionalTrimmedString(recipient.accountCode) !== undefined;
    const hasEmail = readOptionalTrimmedString(recipient.email) !== undefined;
    if (hasAccountCode === hasEmail) {
      throw new ProviderRequestError(400, "each recipient must provide exactly one of accountCode or email");
    }
  }
}

function buildPlantRecipients(value: unknown) {
  if (!Array.isArray(value)) {
    return undefined;
  }
  return value.map((recipientValue) => {
    const recipient = optionalRecord(recipientValue);
    if (!recipient) {
      throw new ProviderRequestError(400, "recipient must be an object");
    }
    return compactObject({
      account_code: readOptionalTrimmedString(recipient.accountCode),
      email: readOptionalTrimmedString(recipient.email),
      name: readOptionalTrimmedString(recipient.name),
      quantity: recipient.quantity,
    });
  });
}

async function requestMoreTreesJson(input: {
  url: string;
  fetcher: typeof fetch;
  phase: MoreTreesRequestPhase;
  method?: "GET" | "POST";
  apiKey?: string;
  body?: Record<string, unknown>;
}) {
  const headers = new Headers({
    accept: "application/json",
    "user-agent": providerUserAgent,
  });
  if (input.apiKey) {
    headers.set("x-api-key", input.apiKey);
  }
  if (input.body !== undefined) {
    headers.set("content-type", "application/json");
  }

  const timeout = createProviderTimeout(undefined, moreTreesRequestTimeoutMs);
  try {
    const response = await input.fetcher(input.url, {
      method: input.method ?? "GET",
      headers,
      body: input.body === undefined ? undefined : JSON.stringify(input.body),
      signal: timeout.signal,
    });
    const payload = await readMoreTreesPayload(response);
    if (!response.ok) {
      throw createMoreTreesError(response, payload, input.phase);
    }
    return payload;
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    if (timeout.didTimeout() || isAbortLikeError(error)) {
      throw new ProviderRequestError(
        504,
        `More Trees request timed out after ${moreTreesRequestTimeoutMs / 1000} seconds`,
      );
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `More Trees request failed: ${error.message}` : "More Trees request failed",
    );
  } finally {
    timeout.cleanup();
  }
}

async function readMoreTreesPayload(response: Response) {
  const text = await response.text().catch(() => "");
  if (!text.trim()) {
    return null;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function createMoreTreesError(response: Response, payload: unknown, phase: MoreTreesRequestPhase) {
  const message =
    extractMoreTreesErrorMessage(payload) ??
    (response.statusText.trim() || `More Trees request failed with ${response.status}`);

  if (response.status === 429) {
    return new ProviderRequestError(429, message);
  }
  if (response.status === 401 || response.status === 403) {
    return new ProviderRequestError(phase === "validate" ? 400 : 409, message);
  }
  if ([400, 404, 406, 422].includes(response.status)) {
    return new ProviderRequestError(400, message);
  }
  return new ProviderRequestError(response.status || 500, message);
}

function extractMoreTreesErrorMessage(payload: unknown) {
  if (typeof payload === "string" && payload.trim()) {
    return payload.trim();
  }
  const record = optionalRecord(payload);
  return (
    readOptionalTrimmedString(record?.message) ??
    readOptionalTrimmedString(record?.error) ??
    readOptionalTrimmedString(record?.detail)
  );
}

function requireObjectResponse(value: unknown, label: string) {
  const record = optionalRecord(value);
  if (!record) {
    throw new ProviderRequestError(502, `More Trees returned an invalid ${label} response`);
  }
  return record;
}

function requireArrayResponse(value: unknown, label: string) {
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(502, `More Trees returned an invalid ${label} response`);
  }
  return value;
}

function requireCredentialValue(value: unknown, fieldName: string) {
  const normalized = readOptionalTrimmedString(value);
  if (!normalized) {
    throw new ProviderRequestError(400, `${fieldName} is required`);
  }
  return normalized;
}

function requireStoredValidationKey(values: Record<string, string> | undefined) {
  const publicValidationKey = readOptionalTrimmedString(values?.publicValidationKey);
  if (!publicValidationKey) {
    throw new ProviderRequestError(500, "more_trees connection is missing publicValidationKey");
  }
  return publicValidationKey;
}

function resolveStoredAccountCode(providerMetadata: Record<string, unknown> | undefined) {
  const accountCode = readOptionalTrimmedString(providerMetadata?.accountCode);
  if (!accountCode) {
    throw new ProviderRequestError(500, "more_trees connection is missing accountCode");
  }
  return accountCode;
}

function readOptionalTrimmedString(value: unknown) {
  const text = optionalString(value)?.trim();
  return text || undefined;
}
