import { describe, expect, it } from "vitest";
import { workizActionHandlers } from "./runtime.ts";

describe("Workiz list responses", () => {
  it.each([
    ["an empty response body", new Response(null, { status: 200 })],
    ["a missing data field", Response.json({ flag: true })],
    ["an empty data list", Response.json({ flag: true, data: [] })],
  ])("normalizes %s to an empty list", async (_description, response) => {
    const result = await workizActionHandlers.list_jobs({}, { apiKey: "workiz-key", fetcher: async () => response });

    expect(result).toEqual({ jobs: [] });
  });

  it("rejects malformed non-empty list responses", async () => {
    await expect(
      workizActionHandlers.list_jobs(
        {},
        {
          apiKey: "workiz-key",
          fetcher: async () => Response.json({ data: "not-an-array" }),
        },
      ),
    ).rejects.toMatchObject({ status: 502, message: "workiz response did not include a record list" });
  });
});
