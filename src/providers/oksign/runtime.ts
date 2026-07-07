import type { CredentialValidationResult } from "../../core/types.ts";
import type { OksignActionName } from "./actions.ts";

import { createHash } from "node:crypto";
import { optionalRecord, optionalString } from "../../core/cast.ts";
import {
  createProviderTimeout,
  isAbortLikeError,
  providerUserAgent,
  ProviderRequestError,
} from "../provider-runtime.ts";

export interface OksignActionContext {
  authorizationHeader: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

export interface OksignCredentialParts {
  accountNumber?: string;
  authorizationToken?: string;
  organizationalToken?: string;
}

type OksignPhase = "validate" | "execute";
type OksignActionHandler = (input: Record<string, unknown>, context: OksignActionContext) => Promise<unknown>;
type OksignRequestHeaders = Record<string, string | undefined>;

export const oksignApiBaseUrl = "https://www.oksign.be";
const oksignDefaultTimeoutMs = 30_000;
const oksignCreditsPath = "/services/rest/v1/credits/retrieve";
const oksignActiveDocumentsPath = "/services/rest/v1/documents/active";
const oksignMetadataV2Path = "/services/rest/v2/metadata/retrieve";
const oksignLinkedListPath = "/services/rest/v1/linkedlist/retrieve";
const oksignUsersPath = "/services/rest/v1/users/retrieve";

export const oksignActionHandlers: Record<OksignActionName, OksignActionHandler> = {
  get_credits(_input, context) {
    return getCredits(context);
  },
  list_active_documents(_input, context) {
    return listActiveDocuments(context);
  },
  get_document_metadata(input, context) {
    return getDocumentMetadata(input, context);
  },
  get_linked_document(input, context) {
    return getLinkedDocument(input, context);
  },
  list_users(_input, context) {
    return listUsers(context);
  },
};

export async function validateOksignCredential(
  input: OksignCredentialParts,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const authorization = buildOksignAuthorizationHeader(input);
  const payload = await requestOksignJson({
    path: oksignCreditsPath,
    authorization,
    fetcher,
    signal,
    phase: "validate",
  });
  const credits = parseCreditsPayload(payload);

  return {
    profile: {
      accountId: buildOksignProviderAccountId(authorization),
      displayName: `OKSign ${readAccountNumber(authorization)}`,
    },
    grantedScopes: [],
    metadata: {
      accountNumber: readAccountNumber(authorization),
      apiBaseUrl: oksignApiBaseUrl,
      validationEndpoint: oksignCreditsPath,
      quantity: credits.quantity,
      validUntil: credits.validUntil,
      paid: credits.paid,
      maxAccountSize: credits.maxAccountSize,
      accountSize: credits.accountSize,
    },
  };
}

export function buildOksignAuthorizationHeader(input: OksignCredentialParts): string {
  const accountNumber = normalizeOksignTokenPart(input.accountNumber, "account number");
  const authorizationToken = normalizeOksignTokenPart(input.authorizationToken, "authorization token");
  const organizationalToken = normalizeOksignTokenPart(input.organizationalToken, "organizational token");
  return `${accountNumber};${authorizationToken};${organizationalToken}`;
}

async function getCredits(context: OksignActionContext): Promise<Record<string, unknown>> {
  const payload = await requestOksignJson({
    path: oksignCreditsPath,
    authorization: context.authorizationHeader,
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
  });

  return parseCreditsPayload(payload);
}

async function listActiveDocuments(context: OksignActionContext): Promise<Record<string, unknown>> {
  const payload = await requestOksignJson({
    path: oksignActiveDocumentsPath,
    authorization: context.authorizationHeader,
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
  });

  return {
    documents: parseArrayReason(payload, "active documents"),
  };
}

async function getDocumentMetadata(
  input: Record<string, unknown>,
  context: OksignActionContext,
): Promise<Record<string, unknown>> {
  const docId = requireDocId(input);
  const payload = await requestOksignJson({
    path: oksignMetadataV2Path,
    authorization: context.authorizationHeader,
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
    headers: {
      "x-oksign-docid": docId,
    },
  });

  return {
    document: parseObjectReason(payload, "metadata document"),
  };
}

async function getLinkedDocument(
  input: Record<string, unknown>,
  context: OksignActionContext,
): Promise<Record<string, unknown>> {
  const docId = requireDocId(input);
  const payload = await requestOksignJson({
    path: oksignLinkedListPath,
    authorization: context.authorizationHeader,
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
    headers: {
      "x-oksign-docid": docId,
    },
    emptyReasonAsNull: true,
  });

  const reason = parseReason(payload);
  if (reason === "") {
    return {
      document: null,
    };
  }

  const document = optionalRecord(reason);
  if (!document) {
    throw new ProviderRequestError(502, "OKSign linked document reason must be an object", payload);
  }

  return {
    document,
  };
}

async function listUsers(context: OksignActionContext): Promise<Record<string, unknown>> {
  const payload = await requestOksignJson({
    path: oksignUsersPath,
    authorization: context.authorizationHeader,
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
  });

  return {
    users: parseArrayReason(payload, "users"),
  };
}

async function requestOksignJson(input: {
  path: string;
  authorization: string;
  fetcher: typeof fetch;
  phase: OksignPhase;
  signal?: AbortSignal;
  headers?: OksignRequestHeaders;
  emptyReasonAsNull?: boolean;
}): Promise<unknown> {
  const timeout = createProviderTimeout(input.signal, oksignDefaultTimeoutMs);
  try {
    const response = await input.fetcher(new URL(input.path, oksignApiBaseUrl), {
      method: "GET",
      headers: buildOksignHeaders(input.authorization, input.headers),
      signal: timeout.signal,
    });
    const payload = await readOksignPayload(response);

    if (!response.ok) {
      throw createOksignHttpError(response.status, payload, input.phase);
    }

    if (input.emptyReasonAsNull && isEmptyOkReason(payload)) {
      return payload;
    }

    return payload;
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    if (timeout.didTimeout() || isAbortLikeError(error)) {
      throw new ProviderRequestError(
        504,
        `OKSign request timed out after ${Math.max(1, Math.ceil(oksignDefaultTimeoutMs / 1000))} seconds`,
      );
    }

    throw new ProviderRequestError(
      502,
      error instanceof Error ? `OKSign request failed: ${error.message}` : "OKSign request failed",
    );
  } finally {
    timeout.cleanup();
  }
}

function buildOksignHeaders(authorization: string, extraHeaders?: OksignRequestHeaders): Headers {
  const headers = new Headers();
  headers.set("x-oksign-authorization", authorization);
  headers.set("accept", "application/json; charset=utf-8");
  headers.set("user-agent", providerUserAgent);

  for (const [key, value] of Object.entries(extraHeaders ?? {})) {
    if (value) {
      headers.set(key, value);
    }
  }

  return headers;
}

async function readOksignPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "OKSign returned invalid JSON");
  }
}

function createOksignHttpError(status: number, payload: unknown, phase: OksignPhase): ProviderRequestError {
  const message = extractOksignErrorMessage(payload) ?? `OKSign request failed with ${status}`;

  if (status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if (status === 401 || status === 403) {
    return new ProviderRequestError(phase === "validate" ? 400 : status, message, payload);
  }
  if (status === 400 || status === 404 || status === 422) {
    return new ProviderRequestError(400, message, payload);
  }

  return new ProviderRequestError(status || 500, message, payload);
}

function extractOksignErrorMessage(payload: unknown): string | undefined {
  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }

  const reason = record.reason;
  if (typeof reason === "string" && reason.trim()) {
    return reason;
  }

  if (Array.isArray(reason)) {
    const first = reason.find((value) => typeof value === "string" && value.trim());
    if (typeof first === "string") {
      return first;
    }
  }

  return optionalString(record.message);
}

function parseCreditsPayload(payload: unknown): Record<string, unknown> {
  const record = requireRecord(payload, "OKSign credits response must be an object");
  return {
    accountSize: requireInteger(record.account_size, "account_size"),
    maxAccountSize: requireInteger(record.max_account_size, "max_account_size"),
    paid: requireBoolean(record.paid, "paid"),
    quantity: requireInteger(record.quantity, "quantity"),
    subscription: requireNonEmptyString(record.subscription, "subscription"),
    validUntil: requireNonEmptyString(record.validuntil, "validuntil"),
  };
}

function parseReason(payload: unknown): unknown {
  const record = requireRecord(payload, "OKSign response must be an object");
  if (record.status === undefined) {
    return record;
  }

  const status = requireStatus(record.status);
  if (status !== "OK") {
    throw new ProviderRequestError(400, extractOksignErrorMessage(payload) ?? "OKSign request failed", payload);
  }

  return record.reason;
}

function parseArrayReason(payload: unknown, label: string): unknown[] {
  const reason = parseReason(payload);
  if (!Array.isArray(reason)) {
    throw new ProviderRequestError(502, `OKSign ${label} reason must be an array`, payload);
  }
  return reason;
}

function parseObjectReason(payload: unknown, label: string): Record<string, unknown> {
  const reason = parseReason(payload);
  const object = optionalRecord(reason);
  if (!object) {
    throw new ProviderRequestError(502, `OKSign ${label} reason must be an object`, payload);
  }
  return object;
}

function isEmptyOkReason(payload: unknown): boolean {
  const record = optionalRecord(payload);
  if (!record || record.status === undefined) {
    return false;
  }
  return requireStatus(record.status) === "OK" && record.reason === "";
}

function requireStatus(value: unknown): "OK" | "FAILED" {
  if (value === "OK" || value === "FAILED") {
    return value;
  }
  throw new ProviderRequestError(502, "OKSign response must include a valid status");
}

function requireRecord(value: unknown, message: string): Record<string, unknown> {
  const record = optionalRecord(value);
  if (record) {
    return record;
  }
  throw new ProviderRequestError(502, message);
}

function requireInteger(value: unknown, fieldName: string): number {
  if (typeof value === "number" && Number.isInteger(value)) {
    return value;
  }
  throw new ProviderRequestError(502, `OKSign ${fieldName} must be an integer`);
}

function requireBoolean(value: unknown, fieldName: string): boolean {
  if (typeof value === "boolean") {
    return value;
  }
  throw new ProviderRequestError(502, `OKSign ${fieldName} must be a boolean`);
}

function requireNonEmptyString(value: unknown, fieldName: string): string {
  const resolved = optionalString(value);
  if (!resolved) {
    throw new ProviderRequestError(502, `OKSign ${fieldName} must be a non-empty string`);
  }
  return resolved;
}

function requireDocId(input: Record<string, unknown>): string {
  const docId = optionalString(input.docId);
  if (!docId) {
    throw new ProviderRequestError(400, "docId is required");
  }
  return docId;
}

function normalizeOksignTokenPart(value: unknown, label: string): string {
  const resolved = optionalString(value);
  if (!resolved) {
    throw new ProviderRequestError(400, `OKSign ${label} is required`);
  }
  if (resolved.includes(";")) {
    throw new ProviderRequestError(400, `OKSign ${label} must not contain semicolons`);
  }
  return resolved;
}

function buildOksignProviderAccountId(authorization: string): string {
  const fingerprint = createHash("sha256").update(authorization).digest("hex").slice(0, 16);
  return `oksign:${readAccountNumber(authorization)}:${fingerprint}`;
}

function readAccountNumber(authorization: string): string {
  return authorization.split(";")[0] ?? "";
}
