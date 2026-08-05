import { describe, expect, it, vi } from "vitest";
import { validateActionInput } from "../../core/validation.ts";
import { provider } from "./definition.ts";
import { mondayCollaborationActionHandlers } from "./runtime-collaboration.ts";

interface GraphqlCall {
  query: string;
  variables: Record<string, unknown>;
}

/** Capture the GraphQL body monday would receive for one action call. */
async function callWithCapture(actionName: string, input: Record<string, unknown>): Promise<GraphqlCall> {
  let captured: GraphqlCall | undefined;
  const fetcher = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
    captured = JSON.parse(String(init?.body)) as GraphqlCall;
    return Response.json({ data: { updates: [] } });
  }) as unknown as typeof fetch;

  await mondayCollaborationActionHandlers[actionName]!({ apiKey: "key", actionName, input }, fetcher);
  return captured!;
}

describe("monday list_updates filters", () => {
  it("sends the declared date range and page as monday's own arguments", async () => {
    const call = await callWithCapture("list_updates", {
      limit: 25,
      page: 3,
      since: "2026-01-01",
      until: "2026-06-30",
    });

    expect(call.variables).toEqual({
      limit: 25,
      page: 3,
      from_date: "2026-01-01",
      to_date: "2026-06-30",
    });
    expect(call.query).toContain("page: $page");
  });

  it("omits filters that were not supplied", async () => {
    const call = await callWithCapture("list_updates", { limit: 5 });

    expect(call.variables).toEqual({ limit: 5 });
  });

  it("accepts the date format the action declares", () => {
    const action = provider.actions.find((action) => action.name === "list_updates");

    expect(validateActionInput(action!, { since: "2026-01-01", until: "2026-06-30" }).valid).toBe(true);
  });
});
