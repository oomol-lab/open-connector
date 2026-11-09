import { describe, expect, it, vi } from "vitest";
import { trelloActionHandlers } from "./runtime.ts";

describe("Trello search", () => {
  it("reads card results from the search envelope and preserves query options", async () => {
    const cards = [{ id: "card-1", name: "Warehouse", desc: "Check stock", idBoard: "board-1" }];
    const fetcher = vi.fn<typeof fetch>(async (input) => {
      const url = new URL(String(input));
      expect(url.pathname).toBe("/1/search");
      expect(url.searchParams.get("query")).toBe("warehouse");
      expect(url.searchParams.get("modelTypes")).toBe("cards,boards");
      expect(url.searchParams.get("cards_limit")).toBe("2");
      expect(url.searchParams.get("boards_limit")).toBe("3");
      expect(url.searchParams.get("members_limit")).toBe("4");
      return Response.json({ options: { terms: [{ text: "warehouse" }], modelTypes: ["cards"] }, cards });
    });

    await expect(
      trelloActionHandlers.search(
        { query: "warehouse", modelTypes: ["cards", "boards"], cardsLimit: 2, boardsLimit: 3, membersLimit: 4 },
        { apiKey: "test-key", apiToken: "test-token", fetcher },
      ),
    ).resolves.toEqual({ results: cards });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("combines model result lists without treating search metadata as a result", async () => {
    const action = { id: "action-1", type: "commentCard", data: { text: "Warehouse update" } };
    const board = { id: "board-1", name: "Warehouse board" };
    const card = { id: "card-1", name: "Warehouse card" };
    const member = { id: "member-1", username: "warehouse" };
    const organization = { id: "org-1", displayName: "Warehouse team" };
    const fetcher = vi.fn<typeof fetch>(async () =>
      Response.json({
        options: { modelTypes: ["actions", "boards", "cards", "members", "organizations"] },
        actions: [action],
        boards: [board],
        cards: [card],
        members: [member],
        organizations: [organization],
      }),
    );

    await expect(
      trelloActionHandlers.search({ query: "warehouse" }, { apiKey: "test-key", apiToken: "test-token", fetcher }),
    ).resolves.toEqual({ results: [action, board, card, member, organization] });
  });

  it.each([
    { options: { modelTypes: ["cards"] }, cards: [] },
    { options: {}, boards: [], cards: [], members: [], organizations: [] },
  ])("returns an empty results list when the requested models have no matches", async (payload) => {
    const fetcher = vi.fn<typeof fetch>(async () => Response.json(payload));
    await expect(
      trelloActionHandlers.search({ query: "no-match" }, { apiKey: "test-key", apiToken: "test-token", fetcher }),
    ).resolves.toEqual({ results: [] });
  });

  it.each(
    [null, [], "unexpected", { cards: null }, { cards: {} }, { cards: ["unexpected"] }].map((payload) => ({ payload })),
  )("reports malformed search responses as provider errors: $payload", async ({ payload }) => {
    const fetcher = vi.fn<typeof fetch>(async () => Response.json(payload));
    await expect(
      trelloActionHandlers.search({ query: "warehouse" }, { apiKey: "test-key", apiToken: "test-token", fetcher }),
    ).rejects.toMatchObject({ status: 502 });
  });
});
