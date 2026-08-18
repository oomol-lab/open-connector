import { describe, expect, it } from "vitest";
import { vercelActionHandlers } from "./runtime.ts";

function actionContext(fetcher: typeof fetch) {
  return {
    apiKey: "vercel-token",
    fetcher,
  };
}

function vercelError(status: number, message: string): Response {
  return Response.json({ error: { code: "not_found", message } }, { status });
}

describe("Vercel webhook actions", () => {
  it("deletes a webhook and normalizes a 204 No Content response", async () => {
    let requestUrl = "";
    let requestMethod = "";
    let authorization = "";
    let contentType: string | null = "";

    const deleted = await vercelActionHandlers.delete_webhook(
      { id: "account_hook_abc" },
      actionContext(async (url, init) => {
        requestUrl = String(url);
        requestMethod = String(init?.method);
        const headers = new Headers(init?.headers);
        authorization = String(headers.get("authorization"));
        contentType = headers.get("content-type");
        return new Response(null, { status: 204 });
      }),
    );

    expect(deleted).toEqual({ deleted: true });
    expect(requestMethod).toBe("DELETE");
    expect(requestUrl).toBe("https://api.vercel.com/v1/webhooks/account_hook_abc");
    expect(authorization).toBe("Bearer vercel-token");
    expect(contentType).toBeNull();
  });

  it("encodes the webhook id in the delete path", async () => {
    let requestUrl = "";

    await vercelActionHandlers.delete_webhook(
      { id: "hook/with spaces" },
      actionContext(async (url) => {
        requestUrl = String(url);
        return new Response(null, { status: 204 });
      }),
    );

    expect(requestUrl).toBe("https://api.vercel.com/v1/webhooks/hook%2Fwith%20spaces");
  });

  it("maps missing webhook responses to invalid input", async () => {
    await expect(
      vercelActionHandlers.delete_webhook(
        { id: "missing" },
        actionContext(async () => vercelError(404, "Not Found")),
      ),
    ).rejects.toMatchObject({ status: 400, message: "Not Found" });

    await expect(
      vercelActionHandlers.delete_webhook(
        { id: "gone" },
        actionContext(async () => vercelError(410, "Gone")),
      ),
    ).rejects.toMatchObject({ status: 400, message: "Gone" });
  });

  it("rejects a missing webhook id before making a request", async () => {
    await expect(
      vercelActionHandlers.delete_webhook(
        {},
        actionContext(async () => {
          throw new Error("no request expected");
        }),
      ),
    ).rejects.toMatchObject({ status: 400, message: "id must be a string" });
  });

  it("still parses JSON webhook payloads after empty-body handling", async () => {
    const result = await vercelActionHandlers.get_webhook(
      { id: "account_hook_abc" },
      actionContext(async (url) => {
        expect(String(url)).toBe("https://api.vercel.com/v1/webhooks/account_hook_abc");
        return Response.json({
          id: "account_hook_abc",
          url: "https://example.com/hooks/vercel",
          events: ["deployment.created"],
          createdAt: 1_700_000_000_000,
        });
      }),
    );

    expect(result).toEqual({
      webhook: {
        id: "account_hook_abc",
        url: "https://example.com/hooks/vercel",
        events: ["deployment.created"],
        createdAt: 1_700_000_000_000,
      },
    });
  });
});
