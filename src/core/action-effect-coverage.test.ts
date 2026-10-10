import { describe, expect, it } from "vitest";
import { createCatalogStore } from "../catalog-store.ts";
import { provider as github } from "../providers/github/definition.ts";
import { provider as gmail } from "../providers/gmail/definition.ts";
import { serializeRuntimeAction } from "../server/api/runtime-api.ts";

describe("OpenMeld action metadata compatibility", () => {
  const catalog = createCatalogStore([github, gmail]);
  it.each([
    ["gmail.fetch_emails", "read"],
    ["gmail.send_email", "write"],
    ["gmail.move_to_trash", "destructive"],
    ["github.get_repository", "read"],
    ["github.create_issue", "write"],
    ["github.delete_repository", "destructive"],
  ] as const)("reports %s as %s through both client contracts", (actionId, effect) => {
    const action = catalog.actionsById.get(actionId);
    if (!action) throw new Error(`Missing action ${actionId}`);
    expect(serializeRuntimeAction(action)).toMatchObject({ effect, operationType: effect });
  });
});
