import { describe, expect, it, vi } from "vitest";
import { osvActionHandlers } from "./runtime.ts";

describe("OSV runtime", () => {
  it("rejects a non-array vulns response", async () => {
    const fetcher = vi.fn(async () => Response.json({ vulns: { id: "GHSA-test" } }));

    await expect(
      osvActionHandlers.query_vulnerabilities(
        { ecosystem: "npm", package: "example" },
        { fetcher: fetcher as typeof fetch },
      ),
    ).rejects.toMatchObject({ status: 502 });
  });
});
