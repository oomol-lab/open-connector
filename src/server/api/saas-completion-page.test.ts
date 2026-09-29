import { runInNewContext } from "node:vm";
import { expect, it, vi } from "vitest";
import { renderSaasCompletionPage } from "./saas-completion-page.ts";

async function complete(status: string, authenticated = true) {
  const statusElement = { textContent: "" };
  const button = { disabled: false, addEventListener: vi.fn() };
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(Response.json({ authenticated }))
    .mockResolvedValueOnce(
      Response.json({
        request: { status, service: "gmail", errorMessage: status === "failed" ? "Authorization denied." : undefined },
      }),
    );
  const postMessage = vi.fn();
  const setTimeout = vi.fn();
  await runInNewContext(renderSaasCompletionPage().split("<script>")[1]!.split("</script>")[0]!, {
    document: { getElementById: (id: string) => (id === "status" ? statusElement : button) },
    location: {
      href: "https://connect.example/oauth/saas/complete?request=request-1",
      origin: "https://connect.example",
    },
    URL,
    fetch: fetcher,
    window: { opener: { postMessage } },
    setTimeout,
    clearTimeout: vi.fn(),
  });
  return { fetcher, statusElement, button, postMessage, setTimeout };
}

it("shows completion after protected synchronization and notifies only the same-origin client", async () => {
  const result = await complete("connected");
  expect(result.fetcher).toHaveBeenLastCalledWith(
    "/api/oauth/connection-requests/request-1/sync",
    expect.objectContaining({
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json", "X-OpenConnector-Request": "sync" },
    }),
  );
  expect(result.statusElement.textContent).toContain("Connection complete");
  expect(result.postMessage).toHaveBeenCalledWith(
    { type: "oauth.completed", service: "gmail" },
    "https://connect.example",
  );
  expect(result.setTimeout).not.toHaveBeenCalled();
});

it("continues pending requests but leaves failed requests terminal", async () => {
  const pending = await complete("initiated");
  expect(pending.statusElement.textContent).toContain("Waiting for authorization");
  expect(pending.setTimeout).toHaveBeenCalledWith(expect.any(Function), 2000);
  const failed = await complete("failed");
  expect(failed.statusElement.textContent).toBe("Authorization denied.");
  expect(failed.setTimeout).not.toHaveBeenCalled();
  expect(failed.postMessage).not.toHaveBeenCalled();
});

it("asks for a Console session before making a mutating synchronization request", async () => {
  const result = await complete("connected", false);
  expect(result.fetcher).toHaveBeenCalledTimes(1);
  expect(result.statusElement.textContent).toContain("sign in to Console");
  expect(result.button.disabled).toBe(false);
});
