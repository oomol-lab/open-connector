import type { RuntimeActionDefinition } from "../../catalog-store.ts";
import type { ConnectionError, ConnectionSummary } from "../../connection-service.ts";
import type { ExecutionResult, ProviderDefinition } from "../../core/types.ts";
import type { Context } from "hono";

import { isPollableAsyncLifecycle } from "../../core/async-lifecycle.ts";

type RuntimeStatus = 400 | 401 | 403 | 404 | 409 | 413 | 429 | 500 | 501;

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
  asyncLifecycle: (NonNullable<RuntimeActionDefinition["asyncLifecycle"]> & { pollable: boolean }) | null;
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
  result: ExecutionResult;
}

export function serializeRuntimeProvider(provider: ProviderDefinition): RuntimeProviderMetadata {
  return {
    service: provider.service,
    displayName: provider.displayName,
    iconUrl: provider.iconUrl ?? null,
    homepageUrl: provider.homepageUrl ?? null,
    categories: provider.categories.map((category) => ({
      id: category,
      displayName: category,
    })),
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
    asyncLifecycle: action.asyncLifecycle
      ? { ...action.asyncLifecycle, pollable: isPollableAsyncLifecycle(action.asyncLifecycle) }
      : null,
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
  const body: RuntimeFailureEnvelope = {
    success: false,
    message: input.message,
    data: input.data ?? null,
    errorCode: input.errorCode,
    meta: input.meta ?? {},
  };

  return context.json(body, input.status);
}

export function writeRuntimeActionResult(context: Context, input: RuntimeActionResultInput): Response {
  const { actionId, executionId, result } = input;
  const meta = { executionId, actionId };
  if (result.ok) {
    return writeRuntimeSuccess(context, result.output ?? null, meta);
  }

  return writeRuntimeFailure(context, {
    status: mapExecutionErrorStatus(result.error?.code),
    errorCode: result.error?.code ?? "provider_error",
    message: result.error?.message ?? "Action execution failed.",
    data: result.error?.details ?? null,
    meta,
  });
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

function mapExecutionErrorStatus(code: string | undefined): 400 | 403 | 404 | 429 | 500 {
  if (code === "authorization_failed") {
    return 403;
  }
  if (code === "connection_not_found") {
    return 404;
  }
  if (code === "rate_limited") {
    return 429;
  }
  if (code === "provider_error" || code === "executor_unavailable") {
    return 500;
  }
  return 400;
}
