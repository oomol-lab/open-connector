import type { RuntimeActionHttpResult } from "./runtime-api.ts";

import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import {
  parseRuntimeActionHttpResult,
  serializeRuntimeActionResult,
  serializeRuntimeFailure,
  writeRuntimeActionHttpResult,
} from "./runtime-api.ts";

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
    ["connection_not_found", 404],
    ["rate_limited", 429],
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
