import type { ExecutionContext, TransitFileStore } from "../../core/types.ts";

import { afterEach, describe, expect, it, vi } from "vitest";
import { validateActionInput } from "../../core/validation.ts";
import { framejetActions } from "./actions.ts";
import { credentialValidators, executors } from "./executors.ts";

const apiKey = "fj_test_key";

interface CapturedRequest {
  url: URL;
  headers: Headers;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function stubFetch(respond: (url: URL) => Response): CapturedRequest[] {
  const requests: CapturedRequest[] = [];
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    requests.push({ url, headers: new Headers(init?.headers) });
    return respond(url);
  });
  return requests;
}

function transitStore(created: File[]): TransitFileStore {
  return {
    maxBytes: 1024,
    async create(file) {
      created.push(file);
      return {
        fileId: "file-1",
        downloadUrl: "https://transit.example/file-1",
        sizeBytes: file.size,
        name: file.name,
        mimeType: file.type,
      };
    },
    async read() {
      throw new Error("not used");
    },
    async delete() {
      return true;
    },
  };
}

function executionContext(transitFiles?: TransitFileStore): ExecutionContext {
  return {
    async getCredential() {
      return {
        authType: "api_key",
        apiKey,
        values: { apiKey },
        profile: { accountId: "api_key", displayName: "Framejet API Key", grantedScopes: [] },
        metadata: {},
      };
    },
    transitFiles,
  };
}

function imageResponse(headers: Record<string, string> = {}): Response {
  return new Response(new Uint8Array([137, 80, 78, 71]), {
    status: 200,
    headers: { "content-type": "image/png", ...headers },
  });
}

function framejetAction(name: string) {
  return framejetActions.find((action) => action.name === name)!;
}

describe("framejet action schemas", () => {
  it.each([["take_screenshot"], ["create_signed_url"]])("caps %s actions at 1000 characters", (name) => {
    const action = framejetAction(name);

    expect(validateActionInput(action, { url: "https://example.com", actions: "x".repeat(1000) }).valid).toBe(true);
    expect(validateActionInput(action, { url: "https://example.com", actions: "x".repeat(1001) }).valid).toBe(false);
  });

  it("caps each goal value at 200 characters", () => {
    const action = framejetAction("take_screenshot");

    expect(validateActionInput(action, { url: "https://example.com", values: ["x".repeat(200)] }).valid).toBe(true);
    expect(validateActionInput(action, { url: "https://example.com", values: ["x".repeat(201)] }).valid).toBe(false);
  });
});

describe("framejet.take_screenshot", () => {
  it("sends capture options as query parameters and stores the image in transit storage", async () => {
    const requests = stubFetch(() => imageResponse({ "x-framejet-cache": "HIT", "x-framejet-remaining": "187" }));
    const created: File[] = [];

    const result = await executors["framejet.take_screenshot"]!(
      {
        url: "https://example.com/pricing",
        full_page: true,
        width: 1440,
        clean: false,
        cache: false,
        goal: "the pricing table with yearly billing selected",
        values: ["Zurich", "London"],
      },
      executionContext(transitStore(created)),
    );

    expect(result).toEqual({
      ok: true,
      output: {
        file: {
          fileId: "file-1",
          downloadUrl: "https://transit.example/file-1",
          sizeBytes: 4,
          name: "framejet-screenshot.png",
          mimeType: "image/png",
        },
        cache: "HIT",
        remaining: 187,
      },
    });
    expect(requests).toHaveLength(1);
    expect(requests[0]!.url.origin + requests[0]!.url.pathname).toBe("https://framejet.dev/v1/take");
    expect(Object.fromEntries(requests[0]!.url.searchParams)).toEqual({
      url: "https://example.com/pricing",
      full_page: "true",
      width: "1440",
      clean: "false",
      cache: "false",
      goal: "the pricing table with yearly billing selected",
      values: "Zurich|London",
    });
    expect(requests[0]!.headers.get("x-api-key")).toBe(apiKey);
    expect(created.map((file) => file.name)).toEqual(["framejet-screenshot.png"]);
  });

  it("names a JPEG capture after its content type and leaves an empty values list out", async () => {
    const requests = stubFetch(() => imageResponse({ "content-type": "image/jpeg; charset=binary" }));

    const result = await executors["framejet.take_screenshot"]!(
      { url: "https://example.com", format: "jpeg", values: [] },
      executionContext(transitStore([])),
    );

    expect(result).toMatchObject({
      ok: true,
      output: { file: { name: "framejet-screenshot.jpg", mimeType: "image/jpeg" }, cache: "MISS", remaining: null },
    });
    expect(requests[0]!.url.search).toBe("?url=https%3A%2F%2Fexample.com&format=jpeg");
  });

  it.each([[""], ["  "], ["unlimited"], ["12.5"]])("reports remaining %j as null", async (remaining) => {
    stubFetch(() => imageResponse({ "x-framejet-remaining": remaining }));

    const result = await executors["framejet.take_screenshot"]!(
      { url: "https://example.com" },
      executionContext(transitStore([])),
    );

    expect(result).toMatchObject({ ok: true, output: { remaining: null } });
  });

  it("sends goal values that total exactly 1000 characters", async () => {
    const requests = stubFetch(() => imageResponse());

    const result = await executors["framejet.take_screenshot"]!(
      { url: "https://example.com", values: ["x".repeat(499), "y".repeat(500)] },
      executionContext(transitStore([])),
    );

    expect(result).toMatchObject({ ok: true });
    expect(requests[0]!.url.searchParams.get("values")).toHaveLength(1000);
  });

  it("rejects goal values over 1000 characters once joined, before any request", async () => {
    const requests = stubFetch(() => imageResponse());

    const result = await executors["framejet.take_screenshot"]!(
      { url: "https://example.com", values: Array.from({ length: 10 }, () => "x".repeat(150)) },
      executionContext(transitStore([])),
    );

    expect(result).toMatchObject({
      ok: false,
      error: {
        code: "invalid_input",
        message: "values must total at most 1000 characters, including the | separators",
        details: { status: 400 },
      },
    });
    expect(requests).toEqual([]);
  });

  it("rejects an image larger than the transit limit", async () => {
    stubFetch(() => new Response(new Uint8Array(2048), { status: 200, headers: { "content-type": "image/png" } }));
    const created: File[] = [];

    const result = await executors["framejet.take_screenshot"]!(
      { url: "https://example.com" },
      executionContext(transitStore(created)),
    );

    expect(result).toMatchObject({ ok: false, error: { details: { status: 413 } } });
    expect(created).toEqual([]);
  });

  it("maps the monthly quota response to insufficient_credit", async () => {
    stubFetch(() =>
      Response.json({ error: "Monthly screenshot limit reached", code: "quota_exceeded" }, { status: 402 }),
    );

    const result = await executors["framejet.take_screenshot"]!(
      { url: "https://example.com" },
      executionContext(transitStore([])),
    );

    expect(result).toMatchObject({
      ok: false,
      error: {
        code: "insufficient_credit",
        message: "Monthly screenshot limit reached (quota_exceeded)",
        details: { status: 402 },
      },
    });
  });

  it("maps a rejected key to authorization_failed and an empty 503 to provider_error", async () => {
    stubFetch(() => Response.json({ error: "Invalid API key", code: "invalid_key" }, { status: 401 }));
    expect(
      await executors["framejet.take_screenshot"]!({ url: "https://example.com" }, executionContext(transitStore([]))),
    ).toMatchObject({ ok: false, error: { code: "authorization_failed", message: "Invalid API key (invalid_key)" } });

    stubFetch(() => new Response("", { status: 503 }));
    expect(
      await executors["framejet.take_screenshot"]!({ url: "https://example.com" }, executionContext(transitStore([]))),
    ).toMatchObject({
      ok: false,
      error: { code: "provider_error", message: "Framejet request failed with status 503" },
    });
  });
});

describe("framejet.create_signed_url", () => {
  it("signs the exact query string it returns", async () => {
    vi.spyOn(Date, "now").mockReturnValue(1_760_000_000_000);
    const requests = stubFetch(() => Response.json({ key_id: "key_test", signing_secret: "secret_test" }));

    const result = await executors["framejet.create_signed_url"]!(
      {
        url: "https://example.com/pricing?plan=pro",
        format: "jpeg",
        full_page: true,
        width: 1440,
        clean: false,
        actions: "type:#city=Zürich;click:#go",
        expires_in: 3600,
      },
      executionContext(),
    );

    // Vector checked independently with Python's hmac module (HMAC-SHA256, hex).
    expect(result).toEqual({
      ok: true,
      output: {
        signed_url:
          "https://framejet.dev/v1/take?url=https%3A%2F%2Fexample.com%2Fpricing%3Fplan%3Dpro&format=jpeg&full_page=true&width=1440&clean=false&actions=type%3A%23city%3DZ%C3%BCrich%3Bclick%3A%23go&key_id=key_test&expires=1760003600&sig=5da4ef644fc66e005cdf7b9c92586d11572bf04cafeb66e374ba240a6c801649",
      },
    });
    expect(requests).toHaveLength(1);
    expect(requests[0]!.url.href).toBe("https://framejet.dev/v1/signing-key");
    expect(requests[0]!.headers.get("x-api-key")).toBe(apiKey);
  });

  it("omits expires when no expiry is requested", async () => {
    stubFetch(() => Response.json({ key_id: "key_test", signing_secret: "secret_test" }));

    const result = await executors["framejet.create_signed_url"]!({ url: "https://example.com" }, executionContext());

    expect(result).toEqual({
      ok: true,
      output: {
        signed_url:
          "https://framejet.dev/v1/take?url=https%3A%2F%2Fexample.com&key_id=key_test&sig=9dfcb23c06ecd3e4bbf651186e7a5f81857908ffa6e902cc01bed9aefe944e06",
      },
    });
  });

  it("fails without leaking a partial signing key response", async () => {
    stubFetch(() => Response.json({ key_id: "key_test" }));

    const result = await executors["framejet.create_signed_url"]!({ url: "https://example.com" }, executionContext());

    expect(result).toEqual({
      ok: false,
      error: {
        code: "provider_error",
        message: "Framejet signing key response is missing key_id or signing_secret",
        details: { status: 502, details: undefined },
      },
    });
  });
});

describe("framejet credential validation", () => {
  it("checks the key against /v1/me", async () => {
    const fetcher = vi.fn(async () => Response.json({ valid: true }));

    const result = await credentialValidators.apiKey!({ apiKey, values: { apiKey } }, { fetcher });

    expect(result).toMatchObject({ profile: { accountId: "api_key" }, metadata: { validationEndpoint: "/v1/me" } });
    const [url, init] = fetcher.mock.calls[0] as unknown as [URL, RequestInit];
    expect(String(url)).toBe("https://framejet.dev/v1/me");
    expect(new Headers(init.headers).get("x-api-key")).toBe(apiKey);
  });

  it("reports a rejected key as a field error", async () => {
    const fetcher = vi.fn(async () =>
      Response.json({ error: "Invalid API key", code: "invalid_key" }, { status: 401 }),
    );

    await expect(credentialValidators.apiKey!({ apiKey, values: { apiKey } }, { fetcher })).rejects.toMatchObject({
      status: 400,
      message: "Invalid API key (invalid_key)",
    });
  });
});
