import type { CatalogStore } from "../../catalog-store.ts";
import type { ActionPolicySnapshot } from "../../core/action-policy.ts";
import type { ActionRunner } from "../actions/action-runner.ts";
import type { ProxyRunner } from "../proxy/proxy-runner.ts";
import type { IIdempotencyStore } from "../storage/idempotency-store.ts";
import type { RuntimeGrant } from "../storage/runtime-token-service.ts";
import type { RuntimeActionHttpResult } from "./runtime-api.ts";
import type { Context } from "hono";

import { Hono } from "hono";
import { ConnectionError } from "../../connection-error.ts";
import { defaultConnectionName } from "../../connection-service.ts";
import { optionalString } from "../../core/cast.ts";
import {
  ActionInputDepthError,
  createIdempotencyExpiry,
  hashActionRequest,
  hashIdempotencyKey,
  readIdempotencyKey,
} from "../actions/action-idempotency.ts";
import { readRuntimeGrant } from "./auth.ts";
import { HttpRequestError, readConnectionName, readJsonBody } from "./http-utils.ts";
import {
  mapConnectionErrorStatus,
  serializeRuntimeActionResult,
  serializeRuntimeFailure,
  unknownActionFailure,
  writeRuntimeActionHttpResult,
  writeRuntimeFailure,
  writeRuntimeSuccess,
} from "./runtime-api.ts";

export interface RuntimeExecutionRoutesOptions {
  catalog: CatalogStore;
  actions: ActionRunner;
  idempotency: IIdempotencyStore;
  proxyRunner: ProxyRunner;
  getPolicySnapshot: (context: Context) => Promise<ActionPolicySnapshot>;
}

/** Action execution and proxy dispatch routes under /v1. */
export function createRuntimeExecutionRoutes({
  catalog,
  actions,
  idempotency,
  proxyRunner,
  getPolicySnapshot,
}: RuntimeExecutionRoutesOptions): Hono {
  const app = new Hono();

  const executeRuntimeAction = async (
    actionId: string,
    input: unknown,
    connectionName: string | undefined,
    policy: ActionPolicySnapshot,
    runtimeGrant: RuntimeGrant | undefined,
    signal: AbortSignal | undefined,
    connectionId?: string,
  ): Promise<RuntimeActionHttpResult> => {
    try {
      const run = await actions.run({
        actionId,
        input,
        caller: "http",
        connectionName,
        connectionId,
        policy,
        runtimeTokenId: runtimeGrant?.tokenId,
        signal,
      });
      if (!run) {
        return serializeRuntimeFailure(unknownActionFailure(actionId));
      }

      return serializeRuntimeActionResult({
        actionId,
        executionId: run.executionId,
        remoteExecutionId: run.remoteExecutionId,
        failureStatus: run.failureStatus,
        retryAfter: run.retryAfter,
        auditPersisted: run.auditPersisted,
        result: run.result,
      });
    } catch (error) {
      if (error instanceof ConnectionError) {
        return serializeRuntimeFailure({
          status: mapConnectionErrorStatus(error),
          errorCode: error.code,
          message: error.message,
          meta: { actionId },
        });
      }

      throw error;
    }
  };

  app.post("/actions/:actionId", async (context) => {
    const actionId = context.req.param("actionId");
    const action = catalog.actionsById.get(actionId);
    if (!action) {
      return writeRuntimeFailure(context, unknownActionFailure(actionId));
    }

    const body = await readJsonBody(context);
    const input = body.input ?? {};
    const connectionName = readConnectionName(context, body);
    const connectionId = optionalString(context.req.header("x-oo-connector-app-id"));
    const runtimeGrant = readRuntimeGrant(context);
    let policy: ActionPolicySnapshot;
    try {
      policy = await getPolicySnapshot(context);
    } catch {
      return writeRuntimeFailure(context, {
        status: 500,
        errorCode: "internal_error",
        message: "Runtime policy is unavailable.",
        meta: { actionId },
      });
    }
    if (!policy.evaluate(action).allowed) {
      return writeRuntimeActionHttpResult(
        context,
        await executeRuntimeAction(
          actionId,
          input,
          connectionName,
          policy,
          runtimeGrant,
          context.req.raw.signal,
          connectionId,
        ),
      );
    }
    const idempotencyKey = readIdempotencyKey(context.req.header("idempotency-key"));
    if (!idempotencyKey.ok) {
      return writeRuntimeFailure(context, {
        status: 400,
        errorCode: "invalid_input",
        message: idempotencyKey.message,
        meta: { actionId },
      });
    }

    if (!idempotencyKey.key) {
      return writeRuntimeActionHttpResult(
        context,
        await executeRuntimeAction(
          actionId,
          input,
          connectionName,
          policy,
          runtimeGrant,
          context.req.raw.signal,
          connectionId,
        ),
      );
    }

    const now = new Date();
    const keyHash = hashIdempotencyKey(idempotencyKey.key);
    let requestHash: string;
    try {
      requestHash = hashActionRequest({
        actionId,
        connectionName: connectionName ?? defaultConnectionName,
        connectionId,
        input,
        runtimeTokenId: runtimeGrant?.tokenId,
      });
    } catch (error) {
      if (!(error instanceof ActionInputDepthError)) {
        throw error;
      }
      return writeRuntimeFailure(context, {
        status: 400,
        errorCode: "invalid_input",
        message: error.message,
        meta: { actionId },
      });
    }
    const claimId = crypto.randomUUID();
    const claim = await idempotency.claim({
      keyHash,
      requestHash,
      claimId,
      now: now.toISOString(),
      expiresAt: createIdempotencyExpiry(now),
    });

    if (claim.kind === "conflict") {
      return writeRuntimeFailure(context, {
        status: 409,
        errorCode: "idempotency_key_conflict",
        message: "Idempotency-Key has already been used with a different request.",
        meta: { actionId },
      });
    }
    if (claim.kind === "in_progress") {
      return writeRuntimeFailure(context, {
        status: 409,
        errorCode: "idempotency_request_in_progress",
        message: "A request with this Idempotency-Key is still in progress.",
        meta: { actionId },
      });
    }
    if (claim.kind === "completed") {
      return writeRuntimeActionHttpResult(context, claim.response);
    }

    const result = await executeRuntimeAction(
      actionId,
      input,
      connectionName,
      policy,
      runtimeGrant,
      context.req.raw.signal,
      connectionId,
    );
    const completed = await idempotency.complete({
      keyHash,
      requestHash,
      claimId,
      response: result,
      expiresAt: createIdempotencyExpiry(new Date()),
    });
    if (!completed) {
      throw new Error("Idempotency claim was replaced before completion.");
    }

    return writeRuntimeActionHttpResult(context, result);
  });

  app.post("/proxy/:service", async (context) => {
    const service = context.req.param("service");
    let body: Record<string, unknown>;
    try {
      body = await readJsonBody(context);
    } catch (error) {
      if (error instanceof HttpRequestError) {
        return writeRuntimeFailure(context, {
          status: error.status,
          errorCode: error.code,
          message: error.message,
          meta: { service },
        });
      }

      throw error;
    }

    let policy: ActionPolicySnapshot;
    try {
      policy = await getPolicySnapshot(context);
    } catch {
      return writeRuntimeFailure(context, {
        status: 500,
        errorCode: "internal_error",
        message: "Runtime policy is unavailable.",
        meta: { service },
      });
    }
    const result = await proxyRunner.run({
      service,
      input: body,
      connectionName: readConnectionName(context, body),
      connectionId: optionalString(context.req.header("x-oo-connector-app-id")),
      policy,
      signal: context.req.raw.signal,
    });
    if (result.ok) {
      return writeRuntimeSuccess(context, result.response, result.meta);
    }

    return writeRuntimeFailure(context, {
      status: result.status,
      errorCode: result.errorCode,
      message: result.message,
      data: result.data,
      meta: result.meta,
    });
  });

  return app;
}
