import type { TransitFileStore } from "../../core/types.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { describe, expect, it, vi } from "vitest";
import { credentialValidators, latchshotActionHandlers } from "./executors.ts";

const pngBytes = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

interface RecordedRequest {
  url: string;
  init?: RequestInit;
}

describe("Latchshot provider", () => {
  it("renders a bounded artifact into local transit storage", async () => {
    const requests: RecordedRequest[] = [];
    const context = createContext(
      requests,
      new Response(pngBytes, {
        headers: {
          "content-type": "image/png",
          "content-length": String(pngBytes.byteLength),
          "x-latchshot-render-ms": "412",
          "x-latchshot-navigation": "complete",
          "x-latchshot-fonts": "original",
          "x-latchshot-scripts": "active",
          "x-quota-limit": "100",
          "x-quota-remaining": "99",
          "x-quota-reset": "2026-08-01T00:00:00.000Z",
        },
      }),
    );

    await expect(
      latchshotActionHandlers.capture_page!(
        {
          url: "https://example.com",
          width: 1200,
          height: 630,
          format: "png",
          delay: 250,
          darkMode: false,
        },
        context,
      ),
    ).resolves.toEqual({
      file: {
        fileId: "output-1",
        downloadUrl: "/api/files/output-1",
        sizeBytes: pngBytes.byteLength,
        name: "latchshot-capture.png",
        mimeType: "image/png",
      },
      diagnostics: {
        renderMs: 412,
        navigation: "complete",
        fonts: "original",
        scripts: "active",
      },
      quota: {
        limit: 100,
        remaining: 99,
        resetAt: "2026-08-01T00:00:00.000Z",
      },
    });

    expect(requests[0]?.url).toBe("https://latchshot.fly.dev/v1/render");
    expect(requests[0]?.init?.method).toBe("POST");
    expect(new Headers(requests[0]?.init?.headers).get("authorization")).toBe("Bearer test-api-key");
    expect(JSON.parse(String(requests[0]?.init?.body))).toEqual({
      url: "https://example.com",
      kind: "screenshot",
      format: "png",
      width: 1200,
      height: 630,
      delay: 250,
      darkMode: false,
    });
  });

  it("fails before consuming quota when transit storage is unavailable", async () => {
    const fetcher = vi.fn(async () => new Response(pngBytes)) as unknown as typeof fetch;

    await expect(
      latchshotActionHandlers.capture_page!({ url: "https://example.com" }, { apiKey: "test-api-key", fetcher }),
    ).rejects.toMatchObject({
      status: 400,
      message: "Latchshot capture requires local transit file storage.",
    });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it.each([
    {
      kind: "screenshot",
      format: "jpeg",
      contentType: "image/jpeg",
      extension: "jpg",
    },
    {
      kind: "pdf",
      format: undefined,
      contentType: "application/pdf",
      extension: "pdf",
    },
  ])("stores $format $kind output with matching artifact metadata", async (sample) => {
    const requests: RecordedRequest[] = [];
    const context = createContext(
      requests,
      new Response(Uint8Array.from([1, 2, 3, 4]), {
        headers: { "content-type": sample.contentType },
      }),
    );

    const input = {
      url: "https://example.com",
      kind: sample.kind,
      ...(sample.format ? { format: sample.format } : {}),
    };
    const result = await latchshotActionHandlers.capture_page!(input, context);

    expect(result).toMatchObject({
      file: {
        name: `latchshot-capture.${sample.extension}`,
        mimeType: sample.contentType,
        sizeBytes: 4,
      },
    });
    expect(JSON.parse(String(requests[0]?.init?.body))).toMatchObject({
      kind: sample.kind,
      format: sample.kind === "pdf" ? "pdf" : sample.format,
    });
  });

  it("consumes a mismatched artifact response without storing it", async () => {
    const response = new Response(pngBytes, { headers: { "content-type": "image/jpeg" } });
    const context = createContext([], response);
    const createFile = vi.spyOn(context.transitFiles!, "create");

    await expect(
      latchshotActionHandlers.capture_page!({ url: "https://example.com", format: "png" }, context),
    ).rejects.toMatchObject({
      status: 502,
      message: "Latchshot artifact type did not match the requested format.",
    });

    expect(response.bodyUsed).toBe(true);
    expect(createFile).not.toHaveBeenCalled();
  });

  it("validates credentials through the non-billable usage endpoint", async () => {
    const requests: RecordedRequest[] = [];
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      requests.push({ url: String(input), init });
      return Response.json(usagePayload());
    }) as unknown as typeof fetch;

    await expect(credentialValidators.apiKey!({ apiKey: "test-api-key", values: {} }, { fetcher })).resolves.toEqual({
      profile: {
        accountId: "latchshot-api-key",
        displayName: "Open Connector QA (Free)",
        grantedScopes: [],
      },
      metadata: {
        apiBaseUrl: "https://latchshot.fly.dev",
        plan: "trial",
        quotaLimit: 100,
        quotaRemaining: 100,
        quotaResetAt: "2026-08-01T00:00:00.000Z",
      },
    });

    expect(requests[0]?.url).toBe("https://latchshot.fly.dev/v1/usage");
    expect(requests[0]?.init?.method).toBeUndefined();
    expect(new Headers(requests[0]?.init?.headers).get("authorization")).toBe("Bearer test-api-key");
  });

  it("reads usage without rejecting newer plan tiers, a spent allowance, or a blank note", async () => {
    const context = createContext([], Response.json(forwardCompatibleUsagePayload()));

    await expect(latchshotActionHandlers.get_usage!({}, context)).resolves.toEqual({
      customer: { name: "Open Connector QA", plan: "enterprise" },
      usage: {
        period: "2026-07",
        plan: "enterprise",
        limit: 0,
        remaining: 0,
        resetAt: "2026-08-01T00:00:00.000Z",
        successful: 12,
        failed: 0,
        reserved: 0,
        outputBytes: 4096,
        renderMs: 512,
        updatedAt: "2026-07-19T00:00:00.000Z",
      },
      upgradeRequest: {
        id: 7,
        keyId: 3,
        requestedPlan: "enterprise",
        note: "",
        status: "escalated",
        createdAt: "2026-07-18T00:00:00.000Z",
        updatedAt: "2026-07-19T00:00:00.000Z",
      },
    });
  });

  it("rejects a usage response whose fields have the wrong type", async () => {
    const context = createContext([], Response.json({ customer: { name: "QA", plan: 7 }, usage: {} }));

    await expect(latchshotActionHandlers.get_usage!({}, context)).rejects.toMatchObject({
      status: 502,
      message: "customer.plan is required.",
    });
  });

  it("preserves a safe provider error without storing an artifact", async () => {
    const context = createContext(
      [],
      Response.json({ error: { code: "unsafe_target", message: "target is not public" } }, { status: 400 }),
    );

    await expect(latchshotActionHandlers.capture_page!({ url: "http://127.0.0.1" }, context)).rejects.toMatchObject({
      status: 400,
      message: "target is not public",
    });
  });
});

function createContext(requests: RecordedRequest[], response: Response): ApiKeyProviderContext {
  return {
    apiKey: "test-api-key",
    fetcher: vi.fn(async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      requests.push({ url: input instanceof Request ? input.url : String(input), init });
      return response;
    }) as unknown as typeof fetch,
    transitFiles: createTransitFileStore(),
  };
}

function createTransitFileStore(): TransitFileStore {
  let outputCount = 0;
  return {
    maxBytes: 1024 * 1024,
    async read(fileId) {
      throw new Error(`Unknown test file: ${fileId}`);
    },
    async create(file) {
      outputCount += 1;
      return {
        fileId: `output-${outputCount}`,
        downloadUrl: `/api/files/output-${outputCount}`,
        sizeBytes: file.size,
        name: file.name,
        mimeType: file.type,
      };
    },
    async delete() {
      return true;
    },
  };
}

function usagePayload(): Record<string, unknown> {
  return {
    customer: { name: "Open Connector QA", plan: "trial" },
    usage: {
      period: "2026-07",
      plan: "trial",
      limit: 100,
      remaining: 100,
      resetAt: "2026-08-01T00:00:00.000Z",
      successful: 0,
      failed: 0,
      reserved: 0,
      outputBytes: 0,
      renderMs: 0,
      updatedAt: null,
    },
    upgradeRequest: null,
  };
}

/** A payload from a future Latchshot release: unknown plan and status values, a spent allowance, and a blank note. */
function forwardCompatibleUsagePayload(): Record<string, unknown> {
  return {
    customer: { name: "Open Connector QA", plan: "enterprise" },
    usage: {
      period: "2026-07",
      plan: "enterprise",
      limit: 0,
      remaining: 0,
      resetAt: "2026-08-01T00:00:00.000Z",
      successful: 12,
      failed: 0,
      reserved: 0,
      outputBytes: 4096,
      renderMs: 512,
      updatedAt: "2026-07-19T00:00:00.000Z",
    },
    upgradeRequest: {
      id: 7,
      keyId: 3,
      requestedPlan: "enterprise",
      note: "",
      status: "escalated",
      createdAt: "2026-07-18T00:00:00.000Z",
      updatedAt: "2026-07-19T00:00:00.000Z",
    },
  };
}
