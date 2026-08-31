import type { ExecutionResult } from "../../core/types.ts";
import type { RuntimeActionHttpResult } from "./runtime-api.ts";

import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { mapProxyErrorStatus } from "../proxy/proxy-runner.ts";
import {
  parseRuntimeActionHttpResult,
  serializeRuntimeAction,
  serializeRuntimeActionResult,
  serializeRuntimeFailure,
  unknownActionFailure,
  writeRuntimeActionHttpResult,
} from "./runtime-api.ts";

type RuntimeExecutionError = NonNullable<ExecutionResult["error"]>;

interface CrossRouteErrorCase {
  title: string;
  error: RuntimeExecutionError;
}

/**
 * The error codes a provider executor can put on the wire: the four
 * `toProviderExecutionError` infers from the upstream status, plus the
 * `insufficient_credit` a provider sets explicitly. Both `/v1` front doors
 * serve the same object, so both must derive the same HTTP status from it.
 */
const crossRouteErrorCases: CrossRouteErrorCase[] = [
  { title: "authorization_failed", error: { code: "authorization_failed", message: "Token expired." } },
  { title: "connection_not_found", error: { code: "connection_not_found", message: "Connect the account." } },
  { title: "insufficient_credit", error: { code: "insufficient_credit", message: "Out of credit." } },
  { title: "invalid_input", error: { code: "invalid_input", message: "Bad input." } },
  { title: "provider_error", error: { code: "provider_error", message: "Upstream failed." } },
  { title: "rate_limited", error: { code: "rate_limited", message: "Slow down." } },
  {
    title: "an upstream not-found status",
    error: { code: "invalid_input", message: "Task not found.", details: { status: 404 } },
  },
  {
    title: "an upstream payload-too-large status",
    error: { code: "invalid_input", message: "response exceeds 4 bytes", details: { status: 413 } },
  },
];

describe("runtime action metadata", () => {
  it("includes the execution status advertised by the runtime catalog", () => {
    expect(
      serializeRuntimeAction({
        id: "example.echo",
        service: "example",
        name: "echo",
        description: "Echo the provided value.",
        requiredScopes: [],
        providerPermissions: [],
        inputSchema: { type: "object" },
        outputSchema: { type: "object" },
        execution: {
          locallyExecutable: true,
          catalogOnly: false,
          requiredAuthTypes: ["api_key"],
          noAuthRunnable: false,
          needsCredential: true,
        },
      }),
    ).toMatchObject({
      execution: {
        locallyExecutable: true,
        catalogOnly: false,
        requiredAuthTypes: ["api_key"],
        noAuthRunnable: false,
        needsCredential: true,
      },
    });
  });
});

describe("runtime action HTTP results", () => {
  it("serializes a successful execution without changing its wire shape", () => {
    expect(
      serializeRuntimeActionResult({
        actionId: "example.echo",
        executionId: "execution-1",
        auditPersisted: true,
        result: { ok: true, output: { value: "hello" } },
      }),
    ).toEqual({
      status: 200,
      body: {
        success: true,
        message: "OK",
        data: { value: "hello" },
        meta: {
          executionId: "execution-1",
          actionId: "example.echo",
          auditPersisted: true,
        },
      },
    });
  });

  it.each([
    ["authorization_failed", 403],
    ["connection_not_allowed", 403],
    ["connection_not_found", 404],
    ["unknown_action", 404],
    ["rate_limited", 429],
    ["insufficient_credit", 402],
    ["provider_error", 500],
    ["internal_error", 500],
    ["oauth_token_expired", 409],
    ["invalid_input", 400],
  ] as const)("maps %s execution failures to status %i", (code, status) => {
    expect(
      serializeRuntimeActionResult({
        actionId: "example.echo",
        executionId: "execution-1",
        auditPersisted: false,
        result: {
          ok: false,
          error: { code, message: "Action failed.", details: { reason: "example" } },
        },
      }),
    ).toEqual({
      status,
      body: {
        success: false,
        message: "Action failed.",
        data: { reason: "example" },
        errorCode: code,
        meta: {
          executionId: "execution-1",
          actionId: "example.echo",
          auditPersisted: false,
        },
      },
    });
  });

  it("preserves an upstream task-not-found status for invalid_input", () => {
    expect(
      serializeRuntimeActionResult({
        actionId: "example.get_task",
        executionId: "execution-1",
        auditPersisted: false,
        result: {
          ok: false,
          error: { code: "invalid_input", message: "Task not found.", details: { status: 404 } },
        },
      }).status,
    ).toBe(404);
  });

  it("preserves an upstream payload-too-large status the way the proxy route does", () => {
    expect(
      serializeRuntimeActionResult({
        actionId: "example.download",
        executionId: "execution-1",
        auditPersisted: false,
        result: {
          ok: false,
          error: { code: "invalid_input", message: "response exceeds 4 bytes", details: { status: 413 } },
        },
      }).status,
    ).toBe(413);
  });

  it.each(crossRouteErrorCases)(
    "returns the same HTTP status through the action route and the proxy route for $title",
    ({ error }) => {
      expect(
        serializeRuntimeActionResult({
          actionId: "example.echo",
          executionId: "execution-1",
          auditPersisted: false,
          result: { ok: false, error },
        }).status,
      ).toBe(mapProxyErrorStatus(error.code, error.details));
    },
  );

  it("serializes runtime failures for persistence", () => {
    expect(
      serializeRuntimeFailure({
        status: 409,
        errorCode: "idempotency_key_conflict",
        message: "The idempotency key was reused for a different request.",
      }),
    ).toEqual({
      status: 409,
      body: {
        success: false,
        message: "The idempotency key was reused for a different request.",
        data: null,
        errorCode: "idempotency_key_conflict",
        meta: {},
      },
    });
  });

  it.each([
    { status: 201, body: { success: true, message: "OK", data: null, meta: {} } },
    { status: 200, body: { success: false, message: "Failed", data: null, errorCode: "failed", meta: {} } },
    { status: 500, body: { success: true, message: "OK", data: null, meta: {} } },
    { status: 500, body: { success: false, message: "Failed", data: null, meta: {} } },
    { status: 500, body: { success: false, message: "Failed", errorCode: "failed", meta: {} } },
    { status: 500, body: { success: false, message: "Failed", data: null, errorCode: "failed", meta: [] } },
  ])("rejects malformed persisted results %#", (result) => {
    expect(() => parseRuntimeActionHttpResult(result)).toThrow("Invalid persisted action response");
  });

  it("accepts a valid persisted failure", () => {
    const result = serializeRuntimeFailure({
      status: 409,
      errorCode: "idempotency_request_in_progress",
      message: "The request is still in progress.",
      meta: { actionId: "example.echo" },
    });

    expect(parseRuntimeActionHttpResult(result)).toEqual(result);
  });

  it("serializes a catalog miss as unknown_action", () => {
    expect(serializeRuntimeFailure(unknownActionFailure("example.missing"))).toEqual({
      status: 404,
      body: {
        success: false,
        message: "Unknown action: example.missing",
        data: null,
        errorCode: "unknown_action",
        meta: { actionId: "example.missing" },
      },
    });
  });

  it("writes a previously serialized result", async () => {
    const result: RuntimeActionHttpResult = {
      status: 409,
      body: {
        success: false,
        message: "The request is still in progress.",
        data: null,
        errorCode: "idempotency_request_in_progress",
        meta: {},
      },
    };
    const app = new Hono().get("/", (context) => writeRuntimeActionHttpResult(context, result));

    const response = await app.request("/");

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual(result.body);
  });
});
