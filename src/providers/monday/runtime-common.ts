import type { CredentialValidationResult } from "../../core/types.ts";

import { compactObject, optionalRecord as asOptionalObject, optionalString } from "../../core/cast.ts";
import {
  createProviderTimeout,
  isAbortLikeError,
  providerFetch,
  ProviderRequestError,
  providerUserAgent,
} from "../provider-runtime.ts";
import { getMondayProviderScopeSurface } from "./scopes.ts";

export const mondayApiUrl: string = "https://api.monday.com/v2";
export const mondayApiVersion: string = "2026-04";
export const mondayUserAgent: string = providerUserAgent;
const mondayDefaultRequestTimeoutMs: number = 30_000;

export type MondayRequestPhase = "validate" | "execute";
type MondayGraphqlError = {
  message?: unknown;
  path?: unknown;
  extensions?: unknown;
};
type MondayGraphqlEnvelope<TData> = {
  data?: TData | null;
  errors?: MondayGraphqlError[];
  account_id?: unknown;
};

interface MondayCurrentUserResponse {
  me?: Record<string, unknown>;
}

interface MondayNormalizedAccount extends Record<string, unknown> {
  id: string;
  name?: string;
  slug?: string;
  tier?: string;
}

interface MondayNormalizedUser extends Record<string, unknown> {
  id: string;
  name?: string;
  email?: string;
  enabled?: boolean;
  is_guest?: boolean;
  created_at?: string;
  account?: MondayNormalizedAccount;
}

interface MondayAccountProfile {
  providerAccountId: string;
  accountLabel: string;
  providerMetadata: Record<string, unknown>;
}

interface MondayItemsPage {
  cursor: string | null;
  items: Array<Record<string, unknown>>;
}

interface MondayDocBlocksFromMarkdownResult {
  success: boolean;
  error: string | null | undefined;
  blockIds: string[];
}

interface MondayCredentialValidationOptions {
  grantedScopes?: string[];
}

export type MondayActionHandler = (input: MondayProviderActionInput, fetcher: typeof fetch) => Promise<unknown>;

export interface MondayProviderActionInput {
  apiKey: string;
  actionName: string;
  input: Record<string, unknown>;
}

export function mondayProviderError(_code: string, message: string, status = 502): ProviderRequestError {
  return new ProviderRequestError(status, message);
}

export async function validateMondayCredential(
  input: Record<string, string>,
  fetcher: typeof fetch = providerFetch,
  options: MondayCredentialValidationOptions = {},
): Promise<CredentialValidationResult> {
  const apiKey = optionalString(input.apiKey);
  if (!apiKey) {
    throw new ProviderRequestError(400, "apiKey is required");
  }
  const currentUser = await fetchMondayCurrentUser(apiKey, fetcher, "validate");
  const profile = buildMondayAccountProfile(currentUser.me, {
    includeValidationEndpoint: true,
  });

  return {
    profile: {
      accountId: profile.providerAccountId,
      displayName: profile.accountLabel,
    },
    grantedScopes: options.grantedScopes ?? getMondayProviderScopeSurface(),
    metadata: profile.providerMetadata,
  };
}

export async function fetchMondayCurrentUser(
  apiKey: string,
  fetcher: typeof fetch,
  phase: MondayRequestPhase,
): Promise<MondayCurrentUserResponse> {
  return mondayGraphqlRequest<MondayCurrentUserResponse>(
    apiKey,
    {
      query: `
        query GetCurrentUser {
          me {
            id
            name
            email
            enabled
            is_guest
            created_at
            account {
              id
              name
              slug
              tier
            }
          }
        }
      `,
      variables: {},
    },
    fetcher,
    phase,
  );
}

export async function fetchMondayCurrentAccountProfile(
  accessToken: string,
  fetcher: typeof fetch,
  phase: MondayRequestPhase = "execute",
): Promise<MondayAccountProfile> {
  const currentUser = await fetchMondayCurrentUser(accessToken, fetcher, phase);
  return buildMondayAccountProfile(currentUser.me);
}

export async function mondayGraphqlRequest<TData>(
  apiKey: string,
  input: {
    query: string;
    variables: Record<string, unknown>;
  },
  fetcher: typeof fetch,
  phase: MondayRequestPhase,
): Promise<TData> {
  const timeout = createProviderTimeout(undefined, mondayDefaultRequestTimeoutMs);
  let response: Response;
  try {
    response = await fetcher(mondayApiUrl, {
      method: "POST",
      headers: {
        Authorization: apiKey,
        "Content-Type": "application/json",
        "API-Version": mondayApiVersion,
        Accept: "application/json",
        "User-Agent": mondayUserAgent,
      },
      body: JSON.stringify({
        query: input.query,
        variables: input.variables,
      }),
      signal: timeout.signal,
    });
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    if (timeout.didTimeout() || isAbortLikeError(error)) {
      throw mondayProviderError(
        "provider_error",
        `monday request timed out after ${Math.max(1, Math.ceil(mondayDefaultRequestTimeoutMs / 1000))} seconds`,
        504,
      );
    }
    throw mondayProviderError(
      "provider_error",
      error instanceof Error ? `monday request failed: ${error.message}` : "monday request failed",
      502,
    );
  } finally {
    timeout.cleanup();
  }

  const payload = await readGraphqlJson<TData>(response);
  if (!response.ok) {
    throw createMondayError(response.status, payload, phase, response.headers);
  }

  if (Array.isArray(payload.errors) && payload.errors.length > 0) {
    throw createMondayError(extractGraphqlStatus(payload.errors[0]), payload, phase, response.headers);
  }

  if (payload.data == null) {
    throw mondayProviderError("provider_error", "monday response did not include data", 502);
  }

  return payload.data;
}

async function readGraphqlJson<TData>(response: Response) {
  const text = await response.text();
  if (!text) {
    return {} as MondayGraphqlEnvelope<TData>;
  }

  try {
    return JSON.parse(text) as MondayGraphqlEnvelope<TData>;
  } catch {
    throw mondayProviderError("provider_error", "monday returned invalid JSON", 502);
  }
}

function createMondayError(status: number | undefined, payload: unknown, phase: MondayRequestPhase, headers?: Headers) {
  const message = extractMondayErrorMessage(payload) ?? `monday request failed with ${status || 500}`;
  const code = extractMondayErrorCode(payload);
  const retryAfter = headers?.get("Retry-After");

  if (
    status === 429 ||
    status === 423 ||
    code === "maxConcurrencyExceeded" ||
    code === "Rate Limit Exceeded" ||
    code === "COMPLEXITY_BUDGET_EXHAUSTED" ||
    code === "IP_RATE_LIMIT_EXCEEDED" ||
    extractRetryInSeconds(payload) !== undefined ||
    retryAfter
  ) {
    return mondayProviderError("rate_limited", message, 429);
  }

  if (phase === "validate" && (status === 401 || status === 403 || code === "Unauthorized")) {
    return mondayProviderError("invalid_input", message, 400);
  }

  if (phase === "execute" && status === 401) {
    return mondayProviderError("credential_expired", message, 409);
  }

  if (phase === "execute" && isMondayPermissionErrorCode(code)) {
    return mondayProviderError("scope_missing", message, 403);
  }

  if (
    status === 400 ||
    status === 403 ||
    status === 404 ||
    status === 422 ||
    code === "InvalidArgumentException" ||
    code === "InvalidBoardIdException" ||
    code === "InvalidColumnIdException" ||
    code === "InvalidUserIdException" ||
    code === "ResourceNotFoundException" ||
    code === "ColumnValueException" ||
    code === "CorrectedValueException" ||
    code === "UserUnauthorizedException" ||
    code === "USER_ACCESS_DENIED"
  ) {
    return mondayProviderError("invalid_input", message, 400);
  }

  if ((status !== undefined && status >= 500) || code === "API_TEMPORARILY_BLOCKED") {
    return mondayProviderError("provider_error", message, status !== undefined && status >= 500 ? status : 502);
  }

  return mondayProviderError("provider_error", message, status !== undefined && status >= 400 ? status : 502);
}

function extractMondayErrorMessage(payload: unknown) {
  const envelope = asOptionalObject(payload);
  if (!envelope) {
    return undefined;
  }

  const errors = Array.isArray(envelope.errors) ? envelope.errors : undefined;
  const firstError = errors?.[0];
  const firstMessage =
    firstError && typeof asOptionalObject(firstError)?.message === "string"
      ? (asOptionalObject(firstError)?.message as string)
      : undefined;
  if (firstMessage) {
    return firstMessage;
  }

  if (typeof envelope.message === "string" && envelope.message.length > 0) {
    return envelope.message;
  }

  return undefined;
}

function extractMondayErrorCode(payload: unknown) {
  const error = extractFirstGraphqlError(payload);
  const extensions = asOptionalObject(error?.extensions);
  return typeof extensions?.code === "string" ? extensions.code : undefined;
}

function extractGraphqlStatus(error: MondayGraphqlError | undefined): number | undefined {
  const extensions = asOptionalObject(error?.extensions);
  if (typeof extensions?.status_code === "number") {
    return extensions.status_code;
  }

  const code = typeof extensions?.code === "string" ? extensions.code : undefined;
  if (code === "Unauthorized") {
    return 401;
  }
  if (isMondayPermissionErrorCode(code)) {
    return 403;
  }
  if (
    code === "maxConcurrencyExceeded" ||
    code === "Rate Limit Exceeded" ||
    code === "COMPLEXITY_BUDGET_EXHAUSTED" ||
    code === "IP_RATE_LIMIT_EXCEEDED"
  ) {
    return 429;
  }

  return undefined;
}

function extractRetryInSeconds(payload: unknown) {
  const error = extractFirstGraphqlError(payload);
  const extensions = asOptionalObject(error?.extensions);
  return typeof extensions?.retry_in_seconds === "number" ? extensions.retry_in_seconds : undefined;
}

function extractFirstGraphqlError(payload: unknown) {
  const envelope = asOptionalObject(payload);
  if (!envelope || !Array.isArray(envelope.errors) || envelope.errors.length === 0) {
    return undefined;
  }

  return envelope.errors[0] as MondayGraphqlError;
}

function isMondayPermissionErrorCode(code: string | undefined) {
  return code === "UserUnauthorizedException" || code === "USER_ACCESS_DENIED" || code === "USER_UNAUTHORIZED";
}

export function serializeJsonInput(value: unknown): unknown {
  if (typeof value === "string") {
    return value;
  }
  if (value && typeof value === "object") {
    return JSON.stringify(value);
  }
  return value;
}

export function normalizeItemsPage(value: unknown): MondayItemsPage {
  const record = asOptionalObject(value);
  return {
    cursor: toOptionalString(record?.cursor) ?? null,
    items: asArray(record?.items).map((item) => normalizeMondayItem(item)),
  };
}

export function normalizeMondayUser(value: unknown): MondayNormalizedUser {
  const record = asOptionalObject(value);
  return compactObject({
    id: toRequiredId(record?.id, "monday user id"),
    name: toOptionalString(record?.name),
    email: toOptionalString(record?.email),
    enabled: toOptionalBoolean(record?.enabled),
    is_guest: toOptionalBoolean(record?.is_guest),
    created_at: toOptionalString(record?.created_at),
    account: normalizeOptionalMondayAccount(record?.account),
  }) as MondayNormalizedUser;
}

export function buildMondayAccountProfile(
  value: unknown,
  options?: {
    includeValidationEndpoint?: boolean;
  },
): MondayAccountProfile {
  const user = normalizeMondayUser(value);
  const account = normalizeOptionalMondayAccount(user.account);

  return {
    providerAccountId: user.id,
    accountLabel: user.name ?? user.email ?? user.id,
    providerMetadata: compactObject({
      apiBaseUrl: mondayApiUrl,
      apiVersion: mondayApiVersion,
      validationEndpoint: options?.includeValidationEndpoint ? "/v2" : undefined,
      accountId: account?.id,
      user: compactObject({
        id: user.id,
        name: user.name,
        email: user.email,
        enabled: user.enabled,
        is_guest: user.is_guest,
        created_at: user.created_at,
      }),
      account,
    }),
  };
}

function normalizeOptionalMondayAccount(value: unknown): MondayNormalizedAccount | undefined {
  const record = asOptionalObject(value);
  if (!record) {
    return undefined;
  }

  return compactObject({
    id: toRequiredId(record.id, "monday account id"),
    name: toOptionalString(record.name),
    slug: toOptionalString(record.slug),
    tier: toOptionalString(record.tier),
  }) as MondayNormalizedAccount;
}

export function normalizeMondayWorkspace(value: unknown): Record<string, unknown> {
  const record = asOptionalObject(value);
  return compactObject({
    id: toRequiredId(record?.id, "monday workspace id"),
    name: toOptionalString(record?.name),
    kind: toOptionalString(record?.kind),
    state: toOptionalString(record?.state),
    description: toOptionalString(record?.description),
  });
}

export function normalizeMondayBoard(value: unknown): Record<string, unknown> {
  const record = asOptionalObject(value);
  return compactObject({
    id: toRequiredId(record?.id, "monday board id"),
    name: toOptionalString(record?.name),
    state: toOptionalString(record?.state),
    board_kind: toOptionalString(record?.board_kind),
    permissions: toOptionalString(record?.permissions),
    description: toOptionalString(record?.description),
    communication: toOptionalString(record?.communication),
    item_nickname: toOptionalString(record?.item_nickname),
    url: toOptionalString(record?.url),
    workspace: normalizeOptionalWorkspace(record?.workspace),
  });
}

function normalizeOptionalWorkspace(value: unknown) {
  const record = asOptionalObject(value);
  if (!record) {
    return undefined;
  }

  return compactObject({
    id: toRequiredId(record.id, "monday workspace id"),
    name: toOptionalString(record.name),
  });
}

export function normalizeMondayGroup(value: unknown): Record<string, unknown> {
  const record = asOptionalObject(value);
  return compactObject({
    id: toRequiredId(record?.id, "monday group id"),
    title: toOptionalString(record?.title),
    color: toOptionalString(record?.color),
    position: toOptionalString(record?.position),
    archived: toOptionalBoolean(record?.archived),
    deleted: toOptionalBoolean(record?.deleted),
  });
}

export function normalizeMondayColumn(value: unknown): Record<string, unknown> {
  const record = asOptionalObject(value);
  return compactObject({
    id: toRequiredId(record?.id, "monday column id"),
    title: toOptionalString(record?.title),
    type: toOptionalString(record?.type),
    description: toOptionalString(record?.description),
    archived: toOptionalBoolean(record?.archived),
    revision: toOptionalString(record?.revision),
    width: toOptionalInteger(record?.width),
    settings: asOptionalObject(record?.settings),
  });
}

export function normalizeMondayTeam(value: unknown): Record<string, unknown> {
  if (value === -1 || value === "-1") {
    return {
      id: "-1",
    };
  }

  const record = asOptionalObject(value);
  return compactObject({
    id: toRequiredId(record?.id, "monday team id"),
    name: toOptionalString(record?.name),
    picture_url: toOptionalString(record?.picture_url),
  });
}

export function normalizeMondayUpdate(value: unknown): Record<string, unknown> {
  const record = asOptionalObject(value);
  return compactObject({
    id: toRequiredId(record?.id, "monday update id"),
    body: toOptionalString(record?.body),
    created_at: toOptionalString(record?.created_at),
    edited_at: toOptionalString(record?.edited_at),
    updated_at: toOptionalString(record?.updated_at),
    creator: normalizeOptionalUser(record?.creator),
  });
}

export function normalizeMondayReply(value: unknown): Record<string, unknown> {
  const record = asOptionalObject(value);
  return compactObject({
    id: toRequiredId(record?.id, "monday reply id"),
    body: toOptionalString(record?.body),
    created_at: toOptionalString(record?.created_at),
    edited_at: toOptionalString(record?.edited_at),
    kind: toOptionalString(record?.kind),
    creator: normalizeOptionalUser(record?.creator),
  });
}

export function normalizeMondayAsset(value: unknown): Record<string, unknown> {
  const record = asOptionalObject(value);
  return compactObject({
    id: toRequiredId(record?.id, "monday asset id"),
    name: toOptionalString(record?.name),
    url: toOptionalString(record?.url),
    public_url: toOptionalString(record?.public_url),
    file_extension: toOptionalString(record?.file_extension),
    file_size: toOptionalInteger(record?.file_size),
    created_at: toOptionalString(record?.created_at),
    url_thumbnail: toOptionalString(record?.url_thumbnail),
    uploaded_by: normalizeOptionalUser(record?.uploaded_by),
  });
}

export function normalizeMondayDoc(value: unknown): Record<string, unknown> {
  const record = asOptionalObject(value);
  return compactObject({
    id: toRequiredId(record?.id, "monday doc id"),
    object_id: toOptionalId(record?.object_id),
    name: toOptionalString(record?.name),
    doc_kind: toOptionalString(record?.doc_kind),
    created_at: toOptionalString(record?.created_at),
    updated_at: toOptionalString(record?.updated_at),
    url: toOptionalString(record?.url),
    relative_url: toOptionalString(record?.relative_url),
    doc_folder_id: toOptionalId(record?.doc_folder_id),
    settings: asOptionalObject(record?.settings),
    created_by: normalizeOptionalUser(record?.created_by),
  });
}

export function normalizeMondayDocNameResult(value: unknown): string {
  if (typeof value === "string" && value.length > 0) {
    return value;
  }

  const record = asOptionalObject(value);
  const name = toOptionalString(record?.name) ?? toOptionalString(record?.doc_name);
  if (!name) {
    throw mondayProviderError("provider_error", "monday doc name payload is missing", 502);
  }

  return name;
}

export function normalizeMondayDeleteDocResult(value: unknown): Record<string, unknown> {
  const record = asOptionalObject(value);
  const deletedDocId = toOptionalId(record?.id) ?? toOptionalId(record?.doc_id);
  if (!deletedDocId) {
    throw mondayProviderError("provider_error", "monday delete doc payload is missing id", 502);
  }

  return compactObject({
    deletedDocId,
    success: toOptionalBoolean(record?.success),
  });
}

export function normalizeDocBlocksFromMarkdownResult(value: unknown): MondayDocBlocksFromMarkdownResult {
  const record = asOptionalObject(value);
  const success = toRequiredBoolean(record?.success, "monday markdown result success");

  return {
    success,
    error: toNullableString(record?.error),
    blockIds: asArray(record?.block_ids)
      .map((entry) => toOptionalId(entry))
      .filter((entry): entry is string => entry !== undefined),
  };
}

export function normalizeMondayItem(value: unknown): Record<string, unknown> {
  const record = asOptionalObject(value);
  const columnValues = Array.isArray(record?.column_values)
    ? asArray(record?.column_values).map((item) => normalizeColumnValue(item))
    : undefined;
  const subitems: Array<Record<string, unknown>> | undefined = Array.isArray(record?.subitems)
    ? asArray(record?.subitems).map((item) => normalizeMondayItem(item))
    : undefined;
  return compactObject({
    id: toRequiredId(record?.id, "monday item id"),
    name: toOptionalString(record?.name),
    state: toOptionalString(record?.state),
    url: toOptionalString(record?.url),
    created_at: toOptionalString(record?.created_at),
    updated_at: toOptionalString(record?.updated_at),
    parent_item: normalizeOptionalItemRef(record?.parent_item),
    group: normalizeOptionalGroup(record?.group),
    board: normalizeOptionalBoard(record?.board),
    creator: normalizeOptionalUser(record?.creator),
    column_values: columnValues,
    subitems,
  });
}

function normalizeOptionalItemRef(value: unknown) {
  const record = asOptionalObject(value);
  if (!record) {
    return undefined;
  }

  return compactObject({
    id: toRequiredId(record.id, "monday parent item id"),
    name: toOptionalString(record.name),
  });
}

function normalizeOptionalBoard(value: unknown) {
  const record = asOptionalObject(value);
  if (!record) {
    return undefined;
  }

  return compactObject({
    id: toRequiredId(record.id, "monday board id"),
    name: toOptionalString(record.name),
  });
}

function normalizeOptionalGroup(value: unknown) {
  const record = asOptionalObject(value);
  if (!record) {
    return undefined;
  }

  return compactObject({
    id: toRequiredId(record.id, "monday group id"),
    title: toOptionalString(record.title),
  });
}

function normalizeOptionalUser(value: unknown) {
  const record = asOptionalObject(value);
  if (!record) {
    return undefined;
  }

  return compactObject({
    id: toRequiredId(record.id, "monday user id"),
    name: toOptionalString(record.name),
    email: toOptionalString(record.email),
  });
}

function normalizeColumnValue(value: unknown) {
  const record = asOptionalObject(value);
  return compactObject({
    id: toOptionalId(record?.id),
    text: toOptionalString(record?.text),
    type: toOptionalString(record?.type),
    value: toOptionalString(record?.value),
  });
}

export function asArray<TValue>(value: TValue[] | null | undefined): TValue[];
export function asArray(value: unknown): unknown[];
export function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function toOptionalString(value: unknown) {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function toOptionalBoolean(value: unknown) {
  return typeof value === "boolean" ? value : undefined;
}

function toOptionalInteger(value: unknown) {
  return typeof value === "number" && Number.isInteger(value) ? value : undefined;
}

function toNullableString(value: unknown) {
  if (value === null) {
    return null;
  }
  return toOptionalString(value);
}

function toOptionalId(value: unknown) {
  if (typeof value === "string" && value.length > 0) {
    return value;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  return undefined;
}

function toRequiredId(value: unknown, fieldName: string) {
  const id = toOptionalId(value);
  if (!id) {
    throw mondayProviderError("provider_error", `${fieldName} is missing`, 502);
  }
  return id;
}

function toRequiredBoolean(value: unknown, fieldName: string) {
  if (typeof value !== "boolean") {
    throw mondayProviderError("provider_error", `${fieldName} is missing`, 502);
  }
  return value;
}

export const mondayItemFields: string = `
  id
  name
  state
  url
  created_at
  updated_at
  group {
    id
    title
  }
  board {
    id
    name
  }
  creator {
    id
    name
    email
  }
  column_values {
    id
    text
    type
    value
  }
`;
