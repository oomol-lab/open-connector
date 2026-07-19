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
