import type { FeishuJsonRequest } from "./client.ts";

import { describe, expect, it } from "vitest";
import { createFeishuDriveActionHandlers } from "./drive-runtime.ts";

/**
 * The collaborator rows Feishu returns, in the shape measured against a live
 * tenant on 2026-08-31: the list is under `items`, and each row carries
 * `member_type` in `openid | openchat | appid` with `perm` in
 * `view | edit | full_access`.
 */
const permissionsResponse = {
  items: [
    { member_id: "ou_4bbabc1053b6868cd9fa4997c0c089ac", member_type: "openid", perm: "full_access" },
    { member_id: "oc_35ad388d44ab4c7889e59bc0837541bd", member_type: "openchat", perm: "view" },
    { member_id: "cli_aad763f142381d1c", member_type: "appid", perm: "full_access" },
  ],
};

function recordingRequest(response: Record<string, unknown>) {
  const calls: { path: string }[] = [];
  const request: FeishuJsonRequest = async (input) => {
    calls.push({ path: input.path });
    return response;
  };
  return { calls, handlers: createFeishuDriveActionHandlers(request) };
}

const input = {
  token: "LgGKde9RcoB5boxJ8wecirJOnAd",
  resourceType: "docx",
  permType: "container",
  fields: "*",
};

describe("Feishu drive permissions", () => {
  /**
   * The regression this file exists for. The handler read `data.members`
   * while Feishu sends `data.items`, and coerced the miss to `[]` — so every
   * document ACL read was a successful empty list, and a consumer that
   * mirrored it would revoke every collaborator it had.
   */
  it("reads the collaborators Feishu returns under `items`", async () => {
    const { calls, handlers } = recordingRequest(permissionsResponse);

    await expect(handlers.list_drive_permissions(input)).resolves.toEqual({
      members: permissionsResponse.items,
    });
    expect(calls).toEqual([{ path: "/drive/v1/permissions/LgGKde9RcoB5boxJ8wecirJOnAd/members" }]);
  });

  /** Accepted after `items`, so a rename cannot break this the other way. */
  it("still accepts `members` if a build ever sends that key", async () => {
    const { handlers } = recordingRequest({ members: permissionsResponse.items });
    await expect(handlers.list_drive_permissions(input)).resolves.toEqual({
      members: permissionsResponse.items,
    });
  });

  it("rejects missing or malformed permissions instead of reporting a complete empty grant", async () => {
    for (const response of [
      {},
      { has_more: false },
      { members: null },
      { items: null, members: permissionsResponse.items },
      { items: "invalid", members: permissionsResponse.items },
      { items: [permissionsResponse.items[0], null] },
    ]) {
      const { handlers } = recordingRequest(response);
      await expect(handlers.list_drive_permissions(input)).rejects.toMatchObject({ status: 502 });
    }
    // Only an explicit array establishes an empty answer. A second key
    // cannot override the authoritative items array, even when it is empty.
    for (const response of [{ items: [] }, { members: [] }, { items: [], members: permissionsResponse.items }]) {
      const { handlers } = recordingRequest(response);
      await expect(handlers.list_drive_permissions(input)).resolves.toEqual({ members: [] });
    }
  });
});
