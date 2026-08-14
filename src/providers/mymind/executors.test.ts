import type { ExecutionContext } from "../../core/types.ts";

import { jwtVerify } from "jose";
import { Buffer } from "node:buffer";
import { afterEach, describe, expect, it } from "vitest";
import { executors } from "./executors.ts";

const keyId = "key_abc123";
const secretBytes = Uint8Array.from(Buffer.from("0123456789abcdef", "utf8"));
const keySecret = Buffer.from(secretBytes).toString("base64");

interface RecordedCall {
  method: string;
  path: string;
  search: string;
  token: string;
}

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function stubFetch(responses: Record<string, unknown>): RecordedCall[] {
  const calls: RecordedCall[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = new URL(String(input));
    const headers = init?.headers as Record<string, string>;
    const method = init?.method ?? "GET";
    calls.push({
      method,
      path: url.pathname,
      search: url.search,
      token: headers.authorization.replace("Bearer ", ""),
    });
    return new Response(JSON.stringify(responses[`${method} ${url.pathname}`] ?? {}), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
  return calls;
}

const context = {
  getCredential: async () => ({
    authType: "custom_credential" as const,
    values: { keyId, keySecret },
    profile: { accountId: keyId, displayName: `mymind key ${keyId}`, grantedScopes: [] },
    metadata: {},
  }),
} as ExecutionContext;

describe("mymind request signing", () => {
  it("binds a freshly signed token to the method and path of each request", async () => {
    const calls = stubFetch({
      "GET /search": { matches: [{ id: "obj-1", score: 1 }] },
      "GET /objects": [{ id: "obj-1" }],
    });

    const result = await executors["mymind.search_objects"]!({ query: "design" }, context);
    expect(result.ok).toBe(true);
    expect(calls.map((call) => `${call.method} ${call.path}`)).toEqual(["GET /search", "GET /objects"]);

    for (const call of calls) {
      const { payload, protectedHeader } = await jwtVerify(call.token, secretBytes);
      expect(protectedHeader).toMatchObject({ alg: "HS256", kid: keyId });
      // A token signed for one endpoint must not be replayable against another.
      expect(payload.path).toBe(call.path);
      expect(payload.method).toBe(call.method);
      expect((payload.exp as number) - (payload.iat as number)).toBe(300);
    }
    expect(new Set(calls.map((call) => call.token)).size).toBe(calls.length);
  });

  it("rejects a secret that is not valid base64 before any request is sent", async () => {
    const calls = stubFetch({});

    const result = await executors["mymind.list_tags"]!({}, {
      getCredential: async () => ({
        authType: "custom_credential" as const,
        values: { keyId, keySecret: "not base64!!" },
        profile: { accountId: keyId, displayName: keyId, grantedScopes: [] },
        metadata: {},
      }),
    } as ExecutionContext);

    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe("invalid_input");
    expect(calls).toHaveLength(0);
  });
});

describe("mymind.search_objects", () => {
  it("keeps mymind's relevance order when hydrating matches", async () => {
    const calls = stubFetch({
      "GET /search": {
        matches: [
          { id: "obj-2", score: 9.5, semanticScore: 0.81 },
          { id: "obj-1", score: 4.2 },
        ],
      },
      // Returned in the opposite order to prove matches are joined by id, not position.
      "GET /objects": [
        { id: "obj-1", title: "First" },
        { id: "obj-2", title: "Second" },
      ],
    });

    const result = await executors["mymind.search_objects"]!({ query: "design", semantic: true }, context);

    expect(result.output).toEqual({
      matches: [
        { id: "obj-2", score: 9.5, semanticScore: 0.81, object: { id: "obj-2", title: "Second" } },
        { id: "obj-1", score: 4.2, object: { id: "obj-1", title: "First" } },
      ],
    });
    expect(calls[0]?.search).toContain("semantic=true");
    // False flags stay off the query string rather than being sent as "false".
    expect(calls[0]?.search).not.toContain("rerank");
    expect(calls[1]?.search).toBe("?id=obj-2&id=obj-1&limit=2");
  });

  it("hydrates nothing when the search returns no matches", async () => {
    const calls = stubFetch({ "GET /search": { matches: [] } });

    const result = await executors["mymind.search_objects"]!({ query: "nothing" }, context);

    expect(result.output).toEqual({ matches: [] });
    expect(calls).toHaveLength(1);
  });
});

describe("mymind.save_url", () => {
  it("rejects a private-network URL before any request is sent", async () => {
    const calls = stubFetch({});

    const result = await executors["mymind.save_url"]!({ url: "http://169.254.169.254/latest/meta-data/" }, context);

    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe("invalid_input");
    expect(calls).toHaveLength(0);
  });
});

/** Reply with one RFC 9457 problem document, the shape mymind returns on failure. */
function stubProblem(
  status: number,
  problem: Record<string, unknown>,
  extraHeaders: Record<string, string> = {},
): void {
  globalThis.fetch = (async () =>
    new Response(JSON.stringify(problem), {
      status,
      headers: { "content-type": "application/problem+json", ...extraHeaders },
    })) as typeof fetch;
}

describe("mymind.get_object_content", () => {
  it("reports an object with no inline body as empty rather than failing", async () => {
    // A bookmark or image is the whole object, and mymind answers 422 for it.
    stubProblem(422, {
      type: "InvalidParameters",
      errors: [{ message: "object does not have content." }],
      status: 422,
    });

    const result = await executors["mymind.get_object_content"]!({ objectId: "obj-1" }, context);

    expect(result.ok).toBe(true);
    expect(result.output).toEqual({ objectId: "obj-1", markdown: "", hasContent: false });
  });

  it("still fails on a 422 that is not about missing content", async () => {
    stubProblem(422, { type: "InvalidParameters", errors: [{ message: "objectId is malformed." }], status: 422 });

    const result = await executors["mymind.get_object_content"]!({ objectId: "obj-1" }, context);

    expect(result.ok).toBe(false);
    expect(result.error?.message).toBe("objectId is malformed.");
  });

  it("does not treat the same wording as missing content when the status is not 422", async () => {
    // The check must key off the real HTTP status, not just the message text,
    // so an unrelated 4xx that happens to echo this wording is not swallowed.
    stubProblem(400, { type: "InvalidParameters", detail: "object does not have content.", status: 400 });

    const result = await executors["mymind.get_object_content"]!({ objectId: "obj-1" }, context);

    expect(result.ok).toBe(false);
  });
});

describe("mymind error mapping", () => {
  it("reads the message out of a validation problem's errors list", async () => {
    // Validation failures carry `errors`, not `detail`; reading only `detail`
    // would reduce these to a bare status code.
    stubProblem(422, {
      type: "InvalidParameters",
      errors: [{ message: "name is required." }, { message: "color is malformed." }],
      status: 422,
    });

    const result = await executors["mymind.create_space"]!({ name: "x" }, context);

    expect(result.error?.code).toBe("invalid_input");
    expect(result.error?.message).toBe("name is required.; color is malformed.");
  });

  it("falls back to the problem type when there is no message at all", async () => {
    stubProblem(409, { type: "Conflict", status: 409 });

    const result = await executors["mymind.delete_object"]!({ objectId: "obj-1" }, context);

    expect(result.error?.message).toBe("Conflict");
  });

  it("prefers detail when mymind sends one", async () => {
    stubProblem(401, { type: "Unauthorized", detail: "Invalid signature", status: 401 });

    const result = await executors["mymind.list_tags"]!({}, context);

    expect(result.error?.code).toBe("authorization_failed");
    expect(result.error?.message).toBe("Invalid signature");
  });

  it("appends the RateLimit header to a 429 so a caller knows which window to wait on", async () => {
    stubProblem(
      429,
      { type: "TooManyRequests", detail: "Burst quota exhausted.", status: 429 },
      { ratelimit: '"burst";r=0;t=42, "sustained";r=0;t=84' },
    );

    const result = await executors["mymind.list_tags"]!({}, context);

    expect(result.error?.code).toBe("rate_limited");
    expect(result.error?.message).toBe(
      'Burst quota exhausted. Retry after approximately 84 seconds. (RateLimit: "burst";r=0;t=42, "sustained";r=0;t=84)',
    );
  });
});
