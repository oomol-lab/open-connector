import { once } from "node:events";
import { createServer } from "node:http";
import { expect, it } from "vitest";
import { createProviderFetch } from "../providers/provider-runtime.ts";
import { withProviderHttpDispatch } from "./provider-http-dispatch.ts";

function deferred<T>(): { promise: Promise<T>; resolve(value: T): void } {
  let resolve: (value: T) => void = () => {};
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

const context = {
  operation: "action",
  service: "example",
  actionId: "example.read",
  connectionId: "connection-1",
  connectionName: "binding-1",
} as const;

it("delivers a native response body before pending feedback can consume its deadline", async () => {
  const server = createServer((_request, response) => response.end("completed provider result"));
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const controller = new AbortController();
  const feedback = deferred<void>();
  let deadline: ReturnType<typeof setTimeout> | undefined;
  let completeFeedback: ReturnType<typeof setTimeout> | undefined;
  try {
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Missing test listener");
    const fetcher = createProviderFetch({
      fetch: async (_url, init) => fetch(`http://127.0.0.1:${address.port}`, init),
    });
    const response = await withProviderHttpDispatch(
      context,
      () => fetcher("https://example.com", { method: "POST", signal: controller.signal }),
      {
        beforeAttempt: () => ({
          allow: true,
          onResult: () => {
            deadline = setTimeout(() => controller.abort(), 500);
            completeFeedback = setTimeout(() => feedback.resolve(), 600);
            return feedback.promise;
          },
        }),
      },
    );
    expect(await response.text()).toBe("completed provider result");
  } finally {
    clearTimeout(deadline);
    clearTimeout(completeFeedback);
    feedback.resolve();
    controller.abort();
    server.close();
    server.closeAllConnections();
  }
});
