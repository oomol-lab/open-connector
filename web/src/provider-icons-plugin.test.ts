import { afterEach, describe, expect, it, vi } from "vitest";
import { providerIconsPlugin } from "../provider-icons-plugin";

afterEach(() => vi.unstubAllGlobals());

describe("optional provider icon catalog", () => {
  it("keeps the build usable and caches the fallback when the catalog is unavailable", async () => {
    const fetcher = vi.fn(async () => new Response(null, { status: 404, statusText: "Not Found" }));
    vi.stubGlobal("fetch", fetcher);
    const plugin = providerIconsPlugin();
    const warn = vi.fn();
    if (typeof plugin.load !== "function") throw new Error("Expected the icon load hook");
    const first = await Reflect.apply(plugin.load, { warn }, ["\0virtual:oomol-provider-icons"]);
    const second = await Reflect.apply(plugin.load, { warn }, ["\0virtual:oomol-provider-icons"]);
    expect(first).toBe("export default {};");
    expect(second).toBe(first);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("404 Not Found"));
  });

  it("continues bundling valid provider logos without a fallback warning", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({ data: [{ service: "github", iconUrl: "https://static.example.com/github.svg" }] }),
      ),
    );
    const plugin = providerIconsPlugin();
    const warn = vi.fn();
    if (typeof plugin.load !== "function") throw new Error("Expected the icon load hook");
    const source = await Reflect.apply(plugin.load, { warn }, ["\0virtual:oomol-provider-icons"]);
    expect(source).toContain('"github":"https://static.example.com/github.svg"');
    expect(warn).not.toHaveBeenCalled();
  });
});
