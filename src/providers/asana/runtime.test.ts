import type { ApiKeyProviderContext, ProviderFetch } from "../provider-runtime.ts";

import { describe, expect, it } from "vitest";
import { ProviderRequestError } from "../provider-runtime.ts";
import {
  deleteAsanaResource,
  getAsanaResource,
  listAsanaResources,
  requestAsana,
  writeAsanaResource,
} from "./runtime.ts";

interface RecordedRequest {
  url: URL;
  init: RequestInit;
}

interface RecordingContext extends ApiKeyProviderContext {
  requests: RecordedRequest[];
}

function recordingContext(...responses: Array<Response | Error>): RecordingContext {
  const requests: RecordedRequest[] = [];
  const fetcher: ProviderFetch = (async (input, init) => {
    requests.push({
      url: input instanceof URL ? input : new URL(input.toString()),
      init: init ?? {},
    });
    const result = responses.shift();
    if (result instanceof Error) {
      throw result;
    }
    if (!result) {
      throw new Error("unexpected Asana request");
    }
    return result;
  }) as ProviderFetch;

  return { apiKey: "asana-token", fetcher, requests };
}

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("Asana runtime", () => {
  it("creates tasks with the Asana JSON envelope", async () => {
    const context = recordingContext(jsonResponse({ data: { gid: "task-1", name: "Ship" } }, 201));

    await expect(writeAsanaResource("/tasks", { name: "Ship" }, "task", context, { method: "POST" })).resolves.toEqual({
      task: { gid: "task-1", name: "Ship" },
    });

    expect(context.requests).toHaveLength(1);
    expect(context.requests[0]?.url.toString()).toBe("https://app.asana.com/api/1.0/tasks");
    expect(context.requests[0]?.init.method).toBe("POST");
    const headers = new Headers(context.requests[0]?.init.headers);
    expect(headers.get("accept")).toBe("application/json");
    expect(headers.get("authorization")).toBe("Bearer asana-token");
    expect(headers.get("content-type")).toBe("application/json");
    expect(context.requests[0]?.init.body).toBe(JSON.stringify({ data: { name: "Ship" } }));
  });

  it("posts writes with opt_fields and the Asana JSON envelope", async () => {
    const context = recordingContext(jsonResponse({ data: { gid: "task-1", name: "Ship" } }, 201));

    await expect(
      writeAsanaResource("/tasks", { name: "Ship" }, "task", context, {
        method: "POST",
        query: { opt_fields: "name,notes" },
      }),
    ).resolves.toEqual({ task: { gid: "task-1", name: "Ship" } });

    expect(context.requests[0]?.url.searchParams.get("opt_fields")).toBe("name,notes");
    expect(context.requests[0]?.init.body).toBe(JSON.stringify({ data: { name: "Ship" } }));
  });

  it("lists resources with opt_fields and exposes Asana next_page offsets as cursors", async () => {
    const context = recordingContext(
      jsonResponse({ data: [{ gid: "task-1" }], next_page: { offset: "after-task-1" } }),
    );

    await expect(listAsanaResources("/tasks", { opt_fields: "name,notes" }, "tasks", context)).resolves.toEqual({
      tasks: [{ gid: "task-1" }],
      nextCursor: "after-task-1",
    });

    expect(context.requests[0]?.url.searchParams.get("opt_fields")).toBe("name,notes");
  });

  it("forwards BodyInit request bodies without applying the JSON envelope", async () => {
    const context = recordingContext(jsonResponse({ data: { gid: "task-1" } }));
    const form = new FormData();
    form.set("name", "Ship");

    await expect(
      requestAsana({ path: "/tasks", context, method: "POST", body: form, wrapData: false }),
    ).resolves.toEqual({ data: { gid: "task-1" } });

    expect(context.requests[0]?.init.body).toBe(form);
    const headers = new Headers(context.requests[0]?.init.headers);
    expect(headers.get("accept")).toBe("application/json");
    expect(headers.has("content-type")).toBe(false);
  });

  it("returns success after a 204 deletion", async () => {
    const context = recordingContext(new Response(null, { status: 204 }));

    await expect(deleteAsanaResource("/tasks/task-1", context)).resolves.toEqual({ success: true });
    expect(context.requests[0]?.init.method).toBe("DELETE");
  });

  it("uses the first Asana error message", async () => {
    const context = recordingContext(
      jsonResponse({ errors: [{ message: "first error" }, { message: "second error" }] }, 400),
    );

    await expect(requestAsana({ path: "/tasks", context })).rejects.toMatchObject({
      status: 400,
      message: "first error",
    });
  });

  it("maps validation authentication failures to invalid input", async () => {
    const context = recordingContext(jsonResponse({ errors: [{ message: "invalid token" }] }, 401));

    await expect(requestAsana({ path: "/users/me", context, phase: "validate" })).rejects.toMatchObject({
      status: 400,
      message: "invalid token",
    });
  });

  it("maps missing requested resources to invalid input", async () => {
    const context = recordingContext(jsonResponse({ errors: [{ message: "task missing" }] }, 404));

    await expect(getAsanaResource("/tasks/task-1", {}, "task", context)).rejects.toMatchObject({
      status: 400,
      message: "task missing",
    });
  });

  it("preserves Asana rate limits", async () => {
    const context = recordingContext(jsonResponse({ errors: [{ message: "slow down" }] }, 429));

    await expect(requestAsana({ path: "/tasks", context })).rejects.toMatchObject({
      status: 429,
      message: "slow down",
    });
  });

  it("rejects non-JSON responses", async () => {
    const context = recordingContext(
      new Response("upstream outage", { status: 502, headers: { "content-type": "text/plain" } }),
    );

    await expect(requestAsana({ path: "/tasks", context })).rejects.toMatchObject({
      status: 502,
      message: "upstream outage",
    });
  });

  it("maps invalid JSON responses to a stable provider error", async () => {
    const context = recordingContext(
      new Response('{"data":', { status: 200, headers: { "content-type": "application/json" } }),
    );
    const request = requestAsana({ path: "/tasks", context });

    await expect(request).rejects.toBeInstanceOf(ProviderRequestError);
    await expect(request).rejects.toMatchObject({
      status: 502,
      message: "Asana response is not valid JSON",
    });
  });

  it("maps aborted requests to gateway timeouts", async () => {
    const context = recordingContext(new DOMException("cancelled", "AbortError"));

    await expect(requestAsana({ path: "/tasks", context })).rejects.toMatchObject({
      status: 504,
      message: "Asana request failed: cancelled",
    });
  });
});
