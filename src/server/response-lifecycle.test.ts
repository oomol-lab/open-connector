import { expect, it, vi } from "vitest";
import { releaseAfterResponse } from "./response-lifecycle.ts";

it("preserves ordinary responses and releases them without consuming their body", async () => {
  const response = Response.json({ ok: true });
  const controller = new AbortController();
  const release = vi.fn();

  expect(releaseAfterResponse(response, controller, release)).toBe(response);
  expect(release).toHaveBeenCalledOnce();
  expect(response.bodyUsed).toBe(false);
  expect(controller.signal.aborted).toBe(false);
});

it("releases SSE responses after delivering their complete body", async () => {
  const controller = new AbortController();
  const release = vi.fn();
  const response = releaseAfterResponse(
    new Response("data: complete\n\n", { headers: { "content-type": "text/event-stream" } }),
    controller,
    release,
  );

  expect(release).not.toHaveBeenCalled();
  expect(await response.text()).toBe("data: complete\n\n");
  expect(release).toHaveBeenCalledOnce();
  expect(controller.signal.aborted).toBe(false);
});

it("aborts work and releases the request when the SSE body fails", async () => {
  const error = new Error("Stream failed");
  const controller = new AbortController();
  const release = vi.fn();
  const body = new ReadableStream<Uint8Array>({
    pull(stream) {
      stream.error(error);
    },
  });
  const response = releaseAfterResponse(
    new Response(body, { headers: { "content-type": "text/event-stream" } }),
    controller,
    release,
  );

  await expect(response.text()).rejects.toBe(error);
  expect(controller.signal.reason).toBe(error);
  expect(release).toHaveBeenCalledOnce();
});

it("propagates cancellation to the work and the source stream", async () => {
  const reason = new Error("Client disconnected");
  const controller = new AbortController();
  const release = vi.fn();
  const cancel = vi.fn();
  const response = releaseAfterResponse(
    new Response(new ReadableStream({ cancel }), { headers: { "content-type": "text/event-stream" } }),
    controller,
    release,
  );

  await response.body!.cancel(reason);
  expect(controller.signal.reason).toBe(reason);
  expect(cancel).toHaveBeenCalledWith(reason);
  expect(release).toHaveBeenCalled();
});
