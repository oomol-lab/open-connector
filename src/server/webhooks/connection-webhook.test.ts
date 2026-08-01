import type { ConnectionCreatedEvent } from "../../connection-service.ts";

import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import {
  buildConnectionCreatedPayload,
  ConnectionWebhookNotifier,
  defaultWebhookSignatureHeader,
  signConnectionWebhook,
  verifyConnectionWebhook,
} from "./connection-webhook.ts";

const event: ConnectionCreatedEvent = {
  connectionId: "conn-1",
  tenant: "tenant-a",
  service: "github",
  connectionName: "default",
  authType: "oauth2",
  createdAt: "2026-07-01T00:00:00.000Z",
};

/** Resolves once the notifier's fire-and-forget delivery has settled. */
async function flush(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe("connection webhook payload", () => {
  it("carries no credential material", () => {
    const payload = JSON.stringify(buildConnectionCreatedPayload(event));

    for (const forbidden of ["apiKey", "accessToken", "refreshToken", "credential", "secret"]) {
      expect(payload).not.toContain(forbidden);
    }
  });

  it("uses the field names an existing receiver already matches on", () => {
    expect(buildConnectionCreatedPayload(event)).toMatchObject({
      type: "connection.created",
      connectionId: "conn-1",
      providerConfigKey: "github",
      tenant: "tenant-a",
      connectionName: "default",
    });
  });
});

describe("connection webhook signature", () => {
  it("is an HMAC-SHA256 hex digest of the exact body", () => {
    const body = JSON.stringify(buildConnectionCreatedPayload(event));

    expect(signConnectionWebhook(body, "secret")).toBe(createHmac("sha256", "secret").update(body).digest("hex"));
  });

  it("verifies a genuine signature and rejects a tampered body or wrong secret", () => {
    const body = JSON.stringify(buildConnectionCreatedPayload(event));
    const signature = signConnectionWebhook(body, "secret");

    expect(verifyConnectionWebhook(body, "secret", signature)).toBe(true);
    expect(verifyConnectionWebhook(`${body} `, "secret", signature)).toBe(false);
    expect(verifyConnectionWebhook(body, "other-secret", signature)).toBe(false);
    expect(verifyConnectionWebhook(body, "secret", "not-a-signature")).toBe(false);
  });
});

describe("ConnectionWebhookNotifier", () => {
  it("posts a signed payload the receiver can verify", async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 200 }));
    new ConnectionWebhookNotifier({
      url: "https://example.test/hook",
      secret: "secret",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    }).notify(event);
    await flush();

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(url).toBe("https://example.test/hook");
    expect(init.method).toBe("POST");
    expect(verifyConnectionWebhook(init.body as string, "secret", headers[defaultWebhookSignatureHeader]!)).toBe(true);
  });

  it("sends the signature under a configured header name", async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 200 }));
    new ConnectionWebhookNotifier({
      url: "https://example.test/hook",
      secret: "secret",
      signatureHeader: "x-nango-hmac-sha256",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    }).notify(event);
    await flush();

    const [, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers["x-nango-hmac-sha256"]).toBeDefined();
    expect(headers[defaultWebhookSignatureHeader]).toBeUndefined();
  });

  it("does not throw when the receiver fails or is unreachable", async () => {
    const rejecting = vi.fn(async () => new Response(null, { status: 500 }));
    const throwing = vi.fn(async () => {
      throw new Error("connect ECONNREFUSED");
    });

    // The credential is already stored by this point, so a receiver being down must not
    // surface as an error to the OAuth callback.
    expect(() =>
      new ConnectionWebhookNotifier({
        url: "https://example.test/hook",
        secret: "secret",
        fetchImpl: rejecting as unknown as typeof fetch,
      }).notify(event),
    ).not.toThrow();
    expect(() =>
      new ConnectionWebhookNotifier({
        url: "https://example.test/hook",
        secret: "secret",
        fetchImpl: throwing as unknown as typeof fetch,
      }).notify(event),
    ).not.toThrow();
    await flush();

    expect(rejecting).toHaveBeenCalledTimes(1);
    expect(throwing).toHaveBeenCalledTimes(1);
  });
});
