import type { ExecutionContext } from "../../core/types.ts";

import { afterEach, expect, it, vi } from "vitest";
import { executors } from "./executors.ts";

const context: ExecutionContext = {
  getCredential: async () => ({
    authType: "custom_credential",
    values: { apiKey: "key", apiToken: "token" },
    profile: { accountId: "member", displayName: "Member", grantedScopes: [] },
    metadata: {},
  }),
};

afterEach(() => vi.unstubAllGlobals());

it("reads card activity and pages back from the last action ID", async () => {
  const action = {
    id: "action-1",
    type: "addMemberToCard",
    idMemberCreator: "member-1",
    data: { idMember: "member-2" },
  };
  const fetcher = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(Response.json([action]))
    .mockResolvedValueOnce(Response.json([]));
  vi.stubGlobal("fetch", fetcher);
  const read = executors["trello.list_card_activity"]!;

  await expect(read({ cardId: "card" }, context)).resolves.toMatchObject({ ok: true, output: { actions: [action] } });
  await expect(read({ cardId: "card", limit: 1, before: action.id }, context)).resolves.toMatchObject({
    ok: true,
    output: { actions: [] },
  });

  const [first, next] = fetcher.mock.calls.map(([url]) => new URL(String(url)));
  expect(first.pathname).toBe("/1/cards/card/actions");
  expect(first.searchParams.get("filter")).toBe("all");
  expect(first.searchParams.get("limit")).toBe("50");
  expect(first.searchParams.has("before")).toBe(false);
  expect(next.searchParams.get("before")).toBe(action.id);
  expect(next.searchParams.get("limit")).toBe("1");
});
