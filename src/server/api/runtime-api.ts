import type { RuntimeActionDefinition, RuntimeProviderDefinition } from "../../catalog-store.ts";
import type { ConnectionError, ConnectionSummary } from "../../connection-service.ts";
import type { ExecutionResult, ProviderScenario } from "../../core/types.ts";
import type { Context } from "hono";

import { optionalInteger, optionalRecord, requiredRecord } from "../../core/cast.ts";

type RuntimeStatus = 400 | 401 | 402 | 403 | 404 | 409 | 413 | 429 | 500 | 501;

/** The HTTP statuses both `/v1` front doors derive from a runtime error code. */
export type RuntimeErrorStatus = 400 | 402 | 403 | 404 | 409 | 413 | 429 | 500;

export type RuntimeResponseMeta = Record<string, unknown>;

export interface RuntimeSuccessEnvelope<TData> {
  success: true;
  message: "OK";
  data: TData;
  meta: RuntimeResponseMeta;
}

export interface RuntimeFailureEnvelope<TData = unknown> {
  success: false;
  message: string;
  data: TData;
  errorCode: string;
  meta: RuntimeResponseMeta;
}

export interface RuntimeProviderMetadata {
  service: string;
  displayName: string;
  iconUrl: string | null;
  homepageUrl: string | null;
  categories: RuntimeProviderCategory[];
  scenario: ProviderScenario;
  authTypes: string[];
}

export interface RuntimeProviderCategory {
  id: string;
  displayName: string;
}

export interface RuntimeActionService {
  service: string;
}

export interface RuntimeActionFollowUp {
  actionId: string;
}

export interface RuntimeActionMetadata {
  id: string;
  service: string;
  name: string;
  description: string;
  requiredScopes: string[];
  providerPermissions: string[];
  inputSchema: RuntimeActionDefinition["inputSchema"];
  outputSchema: RuntimeActionDefinition["outputSchema"];
  followUpActions: RuntimeActionFollowUp[];
  asyncLifecycle: RuntimeActionDefinition["asyncLifecycle"] | null;
  execution: RuntimeActionDefinition["execution"];
}

export interface RuntimeConnectedApp {
  id: string;
  service: string;
  status: "active" | "disconnected";
  alias: string;
  authType: string;
  displayName: string;
  accountLabel: string;
  isDefault: boolean;
  scopes: string[];
}

export interface RuntimeFailureInput {
  status: RuntimeStatus;
  errorCode: string;
  message: string;
  data?: unknown;
  meta?: RuntimeResponseMeta;
}

export interface RuntimeActionResultInput {
  actionId: string;
  executionId: string;
  auditPersisted: boolean;
  result: ExecutionResult;
}

/** HTTP status and JSON envelope persisted for idempotent action replay. */
export type RuntimeActionHttpResult =
  | { status: 200; body: RuntimeSuccessEnvelope<unknown> }
  | { status: RuntimeStatus; body: RuntimeFailureEnvelope };

export function serializeRuntimeProvider(provider: RuntimeProviderDefinition): RuntimeProviderMetadata {
  return {
    service: provider.service,
    displayName: provider.displayName,
    iconUrl: provider.iconUrl ?? null,
    homepageUrl: provider.homepageUrl ?? null,
    categories: provider.categories.map((category) => ({
      id: category,
      displayName: category,
    })),
    scenario: provider.scenario,
    authTypes: provider.authTypes,
  };
}

export function serializeRuntimeActionService(service: string): RuntimeActionService {
  return { service };
}

export function serializeRuntimeAction(action: RuntimeActionDefinition): RuntimeActionMetadata {
  const metadata: RuntimeActionMetadata = {
    id: action.id,
    service: action.service,
    name: action.name,
    description: action.description,
    requiredScopes: action.requiredScopes,
    providerPermissions: action.providerPermissions,
    inputSchema: action.inputSchema,
    outputSchema: action.outputSchema,
    followUpActions: (action.followUpActions ?? []).map((actionId) => ({ actionId })),
    asyncLifecycle: action.asyncLifecycle ?? null,
    execution: action.execution,
  };

  return metadata;
}

export function serializeRuntimeConnectedApp(connection: ConnectionSummary): RuntimeConnectedApp {
  return {
    id: connection.id,
    service: connection.service,
    status: connection.configured ? "active" : "disconnected",
    alias: connection.connectionName,
    authType: connection.authType,
    displayName: connection.profile.displayName,
    accountLabel: connection.profile.displayName,
    isDefault: connection.default,
    scopes: connection.profile.grantedScopes,
  };
}

export function writeRuntimeSuccess<TData>(context: Context, data: TData, meta?: RuntimeResponseMeta): Response {
  const body: RuntimeSuccessEnvelope<TData> = {
    success: true,
    message: "OK",
    data,
    meta: meta ?? {},
  };

  return context.json(body);
}

export function writeRuntimeFailure(context: Context, input: RuntimeFailureInput): Response {
  return writeRuntimeActionHttpResult(context, serializeRuntimeFailure(input));
}

/** Public 404 used when an action id is missing from the catalog. */
export function unknownActionFailure(actionId: string): RuntimeFailureInput {
  return {
    status: 404,
    errorCode: "unknown_action",
    message: `Unknown action: ${actionId}`,
    meta: { actionId },
  };
}

/** Build a runtime failure response without writing it to the HTTP context. */
export function serializeRuntimeFailure(input: RuntimeFailureInput): RuntimeActionHttpResult {
  const body: RuntimeFailureEnvelope = {
    success: false,
    message: input.message,
    data: input.data ?? null,
    errorCode: input.errorCode,
    meta: input.meta ?? {},
  };

  return { status: input.status, body };
}

/** Build the persistable HTTP response for a completed action execution. */
export function serializeRuntimeActionResult(input: RuntimeActionResultInput): RuntimeActionHttpResult {
  const { actionId, executionId, auditPersisted, result } = input;
  const meta = { executionId, actionId, auditPersisted };
  if (result.ok) {
    return {
      status: 200,
      body: {
        success: true,
        message: "OK",
        data: result.output ?? null,
        meta,
      },
    };
  }

  return serializeRuntimeFailure({
    status: mapRuntimeErrorStatus(result.error?.code, result.error?.details),
    errorCode: result.error?.code ?? "provider_error",
    message: result.error?.message ?? "Action execution failed.",
    data: result.error?.details ?? null,
    meta,
  });
}

/** Validate an action response decoded from persistent storage. */
export function parseRuntimeActionHttpResult(value: unknown): RuntimeActionHttpResult {
  const invalid = (message: string): Error => new Error(`Invalid persisted action response: ${message}`);
  const result = requiredRecord(value, "response", invalid);
  const body = requiredRecord(result.body, "response.body", invalid);
  requiredRecord(body.meta, "response.body.meta", invalid);

  if (!("data" in body) || typeof body.message !== "string") {
    throw invalid("response.body must contain message and data");
  }

  if (result.status === 200 && body.success === true && body.message === "OK") {
    return { status: 200, body: body as unknown as RuntimeSuccessEnvelope<unknown> };
  }

  if (isRuntimeStatus(result.status) && body.success === false && typeof body.errorCode === "string") {
    return { status: result.status, body: body as unknown as RuntimeFailureEnvelope };
  }

  throw invalid("status and body envelope do not match");
}

/** Write a newly serialized or replayed action response. */
export function writeRuntimeActionHttpResult(context: Context, result: RuntimeActionHttpResult): Response {
  return context.json(result.body, result.status);
}

export function mapConnectionErrorStatus(error: ConnectionError): 400 | 404 | 409 {
  if (error.code === "unknown_service" || error.code === "connection_not_found") {
    return 404;
  }
  if (error.code === "oauth_token_expired" || error.code === "oauth_refresh_unavailable") {
    return 409;
  }
  return 400;
}

/**
 * The documented runtime error codes and the HTTP status each maps to. This is
 * the only place that pairing is written down, and both `/v1` front doors read
 * it through `mapRuntimeErrorStatus`, so the action route and the proxy route
 * cannot disagree about the same error object.
 */
const runtimeStatusByErrorCode = new Map<string, RuntimeErrorStatus>([
  ["authorization_failed", 403],
  ["connection_not_allowed", 403],
  ["connection_not_found", 404],
  ["executor_unavailable", 500],
  ["insufficient_credit", 402],
  ["internal_error", 500],
  ["invalid_input", 400],
  ["oauth_refresh_unavailable", 409],
  ["oauth_token_expired", 409],
  ["provider_error", 500],
  ["rate_limited", 429],
  ["unknown_action", 404],
  ["unknown_service", 404],
]);

/**
 * The codes the connection, policy and dispatch layers raise on their own. A
 * provider that borrowed one would answer with a status that has nothing to do
 * with what its upstream said.
 */
const runtimeInternalErrorCodes = new Set([
  "connection_not_allowed",
  "connection_not_found",
  "executor_unavailable",
  "internal_error",
  "oauth_refresh_unavailable",
  "oauth_token_expired",
  "unknown_action",
  "unknown_service",
]);

/** Every error code the runtime routes map to a documented HTTP status. */
export const runtimeErrorCodes: readonly string[] = [...runtimeStatusByErrorCode.keys()];

/** The codes a provider may put in `ProviderRequestError`'s `code` argument. */
export const providerErrorCodes: readonly string[] = runtimeErrorCodes.filter(
  (code) => !runtimeInternalErrorCodes.has(code),
);

/**
 * Map a runtime error onto the HTTP status the `/v1` routes answer with. An
 * upstream status the provider preserved in `details.status` wins where the
 * runtime has a status for it and the code alone does not.
 */
export function mapRuntimeErrorStatus(code: string | undefined, details?: unknown): RuntimeErrorStatus {
  const upstreamStatus = optionalInteger(optionalRecord(details)?.status);
  if (upstreamStatus === 413) {
    return 413;
  }
  if (code === "invalid_input" && upstreamStatus === 404) {
    return 404;
  }
  return (code === undefined ? undefined : runtimeStatusByErrorCode.get(code)) ?? 400;
}

function isRuntimeStatus(value: unknown): value is RuntimeStatus {
  return (
    value === 400 ||
    value === 401 ||
    value === 402 ||
    value === 403 ||
    value === 404 ||
    value === 409 ||
    value === 413 ||
    value === 429 ||
    value === 500 ||
    value === 501
  );
}
