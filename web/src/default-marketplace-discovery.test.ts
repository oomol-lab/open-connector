import { afterEach, expect, it, vi } from "vitest";
import { loadDefaultMarketplaceCatalog } from "./default-marketplace-discovery";

afterEach(() => vi.unstubAllGlobals());

it("reads public discovery through the same-origin runtime endpoint", async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValue(new Response(JSON.stringify({ version: 1, name: "Default", actions: ["kling.generate"] })));
  vi.stubGlobal("fetch", fetcher);
  await expect(loadDefaultMarketplaceCatalog(new AbortController().signal)).resolves.toEqual({
    name: "Default",
    actions: ["kling.generate"],
  });
  expect(fetcher).toHaveBeenCalledWith(
    "/api/marketplace/discovery",
    expect.objectContaining({ credentials: "same-origin", redirect: "error" }),
  );
});

it.each([
  new Response("offline", { status: 503 }),
  new Response(JSON.stringify({ version: 1, name: "Default", actions: [42] })),
])("rejects failed or malformed catalogs", async (response) => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));
  await expect(loadDefaultMarketplaceCatalog(new AbortController().signal)).rejects.toThrow();
});
