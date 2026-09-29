import { runInNewContext } from "node:vm";
import { expect, it, vi } from "vitest";
import { renderSaasCompletionPage } from "./saas-completion-page.ts";

async function complete(status: string, authenticated = true, language = "en", returnUri?: string) {
  const elements = Object.fromEntries(
    ["status", "retry", "close", "login", "title", "badge", "note"].map((id) => [
      id,
      { textContent: "", disabled: false, hidden: false, addEventListener: vi.fn() },
    ]),
  );
  const statusElement = elements.status!;
  const button = elements.retry!;
  const closeWindow = vi.fn();
  const assign = vi.fn();
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(Response.json({ authenticated }))
    .mockResolvedValueOnce(
      Response.json({
        returnUri,
        request: { status, service: "gmail", errorMessage: status === "failed" ? "Authorization denied." : undefined },
      }),
    );
  const postMessage = vi.fn();
  const setTimeout = vi.fn();
  await runInNewContext(renderSaasCompletionPage().split("<script>")[1]!.split("</script>")[0]!, {
    document: { documentElement: { lang: "" }, getElementById: (id: string) => elements[id] },
    navigator: { languages: ["en"] },
    localStorage: { getItem: () => language },
    location: {
      href: "https://connect.example/oauth/saas/complete?request=request-1",
      origin: "https://connect.example",
      assign,
    },
    URL,
    fetch: fetcher,
    window: { opener: { postMessage }, close: closeWindow },
    setTimeout,
    clearTimeout: vi.fn(),
  });
  return { fetcher, statusElement, button, postMessage, setTimeout, elements, closeWindow, assign };
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
  expect(result.elements.title!.textContent).toBe("Connection complete");
  expect(result.postMessage).toHaveBeenCalledWith(
    { type: "oauth.completed", service: "gmail" },
    "https://connect.example",
  );
  expect(result.setTimeout).toHaveBeenCalledWith(expect.any(Function), 2000);
  expect(result.elements.login!.hidden).toBe(true);
  expect(result.button.hidden).toBe(true);
  result.setTimeout.mock.calls[0]![0]();
  expect(result.closeWindow).toHaveBeenCalledOnce();
  expect(result.elements.note!.textContent).toContain("You can now close");
});

it("continues pending requests but leaves failed requests terminal", async () => {
  const pending = await complete("initiated");
  expect(pending.statusElement.textContent).toContain("Waiting for authorization");
  expect(pending.setTimeout).toHaveBeenCalledWith(expect.any(Function), 2000);
  const failed = await complete("failed");
  expect(failed.statusElement.textContent).toContain("Authorization could not be completed");
  expect(failed.setTimeout).not.toHaveBeenCalled();
  expect(failed.postMessage).not.toHaveBeenCalled();
});

it("asks for a Console session before making a mutating synchronization request", async () => {
  const result = await complete("connected", false);
  expect(result.fetcher).toHaveBeenCalledTimes(1);
  expect(result.statusElement.textContent).toContain("Sign in to Console");
  expect(result.button.disabled).toBe(false);
});

it("uses the Console language and keeps an explicit client return URI ahead of auto-close", async () => {
  const result = await complete("connected", true, "zh-CN", "myapp://callback");
  expect(result.elements.title!.textContent).toBe("连接完成");
  expect(result.elements.close!.textContent).toBe("关闭窗口");
  expect(result.assign).toHaveBeenCalledWith("myapp://callback");
  expect(result.setTimeout).not.toHaveBeenCalled();
  expect(result.closeWindow).not.toHaveBeenCalled();
});

it("stops polling expired requests and allows the window to be closed", async () => {
  const result = await complete("expired");
  expect(result.statusElement.textContent).toMatch(/expired/i);
  expect(result.button.hidden).toBe(true);
  expect(result.elements.close!.hidden).toBe(false);
  expect(result.setTimeout).not.toHaveBeenCalled();
  expect(result.postMessage).not.toHaveBeenCalled();
});
