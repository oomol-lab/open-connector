import { afterEach, describe, expect, it, vi } from "vitest";
import { providerIconsPlugin } from "../provider-icons-plugin";

afterEach(() => vi.unstubAllGlobals());

describe("bundled provider icon catalog", () => {
  it("loads and caches the checked-in snapshot without network access", async () => {
    const fetcher = vi.fn(() => {
      throw new Error("Network unavailable");
    });
    vi.stubGlobal("fetch", fetcher);
    const plugin = providerIconsPlugin();
    const warn = vi.fn();
    if (typeof plugin.load !== "function") throw new Error("Expected the icon load hook");
    const first = await Reflect.apply(plugin.load, { warn }, ["\0virtual:oomol-provider-icons"]);
    const second = await Reflect.apply(plugin.load, { warn }, ["\0virtual:oomol-provider-icons"]);
    expect(first).toContain('"github":');
    expect(second).toBe(first);
    expect(fetcher).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
  });
});
