import { afterEach, describe, expect, it, vi } from "vitest";
import { setDefaultGuardedFetchDnsLookup } from "./guarded-fetch.ts";
import { isFailureEnvelope, isSuccessEnvelope, readRemoteJson, requestRemote } from "./remote-http.ts";
import { setEgressTrustedHosts } from "./request.ts";

afterEach(() => {
  setDefaultGuardedFetchDnsLookup(null);
  setEgressTrustedHosts([]);
  vi.useRealTimers();
});

describe("remote HTTP", () => {
  it.each([
    "http://example.com/",
    "https://secret@example.com/",
    "https://127.0.0.1/",
    "https://169.254.169.254/",
    "https://example.com/#secret",
  ])("rejects unsafe service URLs before sending credentials: %s", async (url) => {
    const fetcher = vi.fn<typeof fetch>();
    await expect(requestRemote({ url, label: "Remote", fetcher }, async () => null)).rejects.toMatchObject({
      kind: "invalid_url",
    });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("rejects private DNS answers even for deployment trusted hosts", async () => {
    setDefaultGuardedFetchDnsLookup(async () => [{ address: "10.0.0.2", family: 4 }]);
    setEgressTrustedHosts(["example.com"]);
    const fetcher = vi.fn<typeof fetch>();
    await expect(
      requestRemote({ url: "https://example.com", label: "Remote", fetcher }, async () => null),
    ).rejects.toMatchObject({ kind: "invalid_url" });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("rejects redirects without forwarding the key and closes the response", async () => {
    const cancel = vi.fn();
    const response = new Response(new ReadableStream({ cancel }), {
      status: 302,
      headers: { location: "https://other.example/" },
    });
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response);
    const consume = vi.fn();
    await expect(
      requestRemote(
        { url: "https://example.com", label: "Remote", fetcher, init: { headers: { authorization: "Bearer secret" } } },
        consume,
      ),
    ).rejects.toMatchObject({ kind: "redirect" });
    expect(fetcher).toHaveBeenCalledExactlyOnceWith(
      new URL("https://example.com"),
      expect.objectContaining({ redirect: "manual" }),
    );
    expect(consume).not.toHaveBeenCalled();
    expect(cancel).toHaveBeenCalledOnce();
  });

  it.each([200, 500])("limits chunked JSON bodies at HTTP %i without trusting content length", async (status) => {
    const cancel = vi.fn();
    const response = new Response(
      new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('{"data":"'));
          controller.enqueue(new Uint8Array(20));
        },
        cancel,
      }),
      { status },
    );
    await expect(readRemoteJson(response, { label: "Remote response", maxBytes: 10 })).rejects.toMatchObject({
      kind: "too_large",
    });
    expect(cancel).toHaveBeenCalledOnce();
  });

  it("rejects declared oversized bodies before reading", async () => {
    const cancel = vi.fn();
    const response = new Response(new ReadableStream({ cancel }), { headers: { "content-length": "1000" } });
    await expect(readRemoteJson(response, { label: "Remote response", maxBytes: 10 })).rejects.toMatchObject({
      kind: "too_large",
    });
    expect(cancel).toHaveBeenCalledOnce();
  });

  it("never includes malformed JSON or transport secrets in errors", async () => {
    await expect(
      readRemoteJson(new Response("token-secret"), { label: "Remote response", maxBytes: 100 }),
    ).rejects.toThrow("Remote response is not valid JSON.");
    const fetcher = vi.fn<typeof fetch>().mockRejectedValue(new Error("authorization: token-secret"));
    await expect(
      requestRemote({ url: "https://example.com", label: "Remote", fetcher }, async () => null),
    ).rejects.toThrow("Remote request failed.");
  });

  it("allows status-based handling of a plain-text 401 and closes its body", async () => {
    const cancel = vi.fn();
    const response = new Response(new ReadableStream({ cancel }), { status: 401 });
    const status = await requestRemote(
      { url: "https://example.com", label: "Remote", fetcher: vi.fn<typeof fetch>().mockResolvedValue(response) },
      async (response) => response.status,
    );
    expect(status).toBe(401);
    expect(cancel).toHaveBeenCalledOnce();
  });

  it("aborts a stalled body read without replaying the request", async () => {
    const controller = new AbortController();
    const cancel = vi.fn();
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(new ReadableStream({ cancel })));
    let reading!: () => void;
    const started = new Promise<void>((resolve) => {
      reading = resolve;
    });
    const result = requestRemote(
      { url: "https://example.com", label: "Remote", fetcher, init: { signal: controller.signal } },
      (response, signal) => {
        reading();
        return readRemoteJson(response, { label: "Remote response", maxBytes: 100, signal });
      },
    );
    const rejected = expect(result).rejects.toMatchObject({ name: "AbortError" });
    await started;
    controller.abort();
    await rejected;
    expect(cancel).toHaveBeenCalledOnce();
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it("includes DNS resolution in the request budget and does not replay", async () => {
    setDefaultGuardedFetchDnsLookup(() => new Promise(() => {}));
    const fetcher = vi.fn<typeof fetch>();
    const result = requestRemote(
      { url: "https://example.com", label: "Remote", fetcher, timeoutMs: 5 },
      async () => null,
    );
    await expect(result).rejects.toMatchObject({ name: "TimeoutError" });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("requires the success discriminator and preserves failure data", () => {
    expect(isSuccessEnvelope({ success: true })).toBe(false);
    expect(isSuccessEnvelope({ success: true, data: null })).toBe(true);
    expect(
      isFailureEnvelope({
        success: false,
        errorCode: "scope_missing",
        message: "Missing scope",
        data: { required: ["read"] },
      }),
    ).toBe(true);
    expect(isFailureEnvelope({ success: false, errorCode: 401, message: "Unauthorized" })).toBe(false);
  });
});
