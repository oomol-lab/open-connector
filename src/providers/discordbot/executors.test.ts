import type { ExecutionContext } from "../../core/types.ts";

import { afterEach, describe, expect, it, vi } from "vitest";
import { validateActionInput } from "../../core/validation.ts";
import { discordbotGuildActions } from "./actions-guilds.ts";
import { executors, proxy } from "./executors.ts";

afterEach(() => {
  vi.unstubAllGlobals();
});

const context: ExecutionContext = {
  getCredential: async () => ({
    authType: "api_key",
    apiKey: "bot-token",
    values: {},
    profile: { accountId: "app-1", displayName: "Discord Bot", grantedScopes: [] },
    metadata: {},
  }),
};

function stubDiscord(response: () => Response) {
  const fetch = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => response());
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

function run(action: string, input: Record<string, unknown>) {
  return executors[`discordbot.${action}`]!(input, context);
}

describe("Discord guild actions", () => {
  it("sends the audit log reason URL-encoded so it cannot break the header", async () => {
    const fetch = stubDiscord(() => new Response(null, { status: 204 }));

    const result = await run("remove_guild_member", {
      guild_id: "10",
      user_id: "20",
      audit_log_reason: "Spam\r\nX-Injected: 1 ünï",
    });

    expect(result).toEqual({ ok: true, output: { success: true } });
    const [url, init] = fetch.mock.calls[0]!;
    expect(url.toString()).toBe("https://discord.com/api/v10/guilds/10/members/20");
    expect(init?.method).toBe("DELETE");
    const headers = new Headers(init?.headers);
    expect(headers.get("authorization")).toBe("Bot bot-token");
    expect(headers.get("x-audit-log-reason")).toBe("Spam%0D%0AX-Injected%3A%201%20%C3%BCn%C3%AF");
  });

  // URL parsing resolves `..`, and Discord decodes `%2F` before routing, so either
  // would reach another endpoint with the same method, such as granting a role.
  it.each([
    ["remove_guild_member_role", { guild_id: "10", user_id: "20", role_id: ".." }, "role_id"],
    ["add_guild_member", { guild_id: "10", user_id: "20/roles/30", access_token: "user-token" }, "user_id"],
    ["modify_guild", { guild_id: "10/roles/30", name: "renamed" }, "guild_id"],
    ["get_user", { user_id: "1/zzz" }, "user_id"],
  ])("rejects a non-snowflake id for %s before sending a request", async (action, input, field) => {
    const fetch = stubDiscord(() => new Response(null, { status: 204 }));

    const result = await run(action, input);

    expect(result).toMatchObject({
      ok: false,
      error: { code: "invalid_input", message: `${field} must be a numeric Discord snowflake id` },
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("returns a null member when Modify Guild Member answers 204", async () => {
    const fetch = stubDiscord(() => new Response(null, { status: 204 }));

    const result = await run("modify_guild_member", { guild_id: "10", user_id: "20", nick: "", roles: null });

    expect(result).toEqual({ ok: true, output: { member: null } });
    const [, init] = fetch.mock.calls[0]!;
    expect(init?.method).toBe("PATCH");
    expect(JSON.parse(String(init?.body))).toEqual({ nick: "", roles: null });
  });

  it("reports an existing member and rejects an unreadable Add Guild Member body", async () => {
    stubDiscord(() => new Response(null, { status: 204 }));
    await expect(
      run("add_guild_member", { guild_id: "10", user_id: "20", access_token: "user-token" }),
    ).resolves.toEqual({ ok: true, output: { already_member: true, member: null } });

    stubDiscord(() => new Response("not json", { status: 201 }));
    await expect(
      run("add_guild_member", { guild_id: "10", user_id: "20", access_token: "user-token" }),
    ).resolves.toEqual({
      ok: false,
      error: { code: "provider_error", message: "Discord returned invalid JSON", details: { status: 502 } },
    });
  });

  it("joins include_roles into the comma-delimited prune count query", async () => {
    const fetch = stubDiscord(() => Response.json({ pruned: 3 }));

    const result = await run("get_guild_prune_count", { guild_id: "10", days: 14, include_roles: ["1", "2"] });

    expect(result).toEqual({ ok: true, output: { pruned: 3 } });
    expect(fetch.mock.calls[0]![0].toString()).toBe(
      "https://discord.com/api/v10/guilds/10/prune?days=14&include_roles=1%2C2",
    );
  });

  // An empty list would send a blank `include_roles=` query value, which is not the
  // documented comma-delimited snowflake list; omitting the field is the way to ask
  // for the default.
  it.each(["get_guild_prune_count", "begin_guild_prune"])("rejects an empty include_roles list for %s", (name) => {
    const action = discordbotGuildActions.find((candidate) => candidate.name === name)!;

    expect(validateActionInput(action, { guild_id: "10", include_roles: [] }).valid).toBe(false);
    expect(validateActionInput(action, { guild_id: "10", include_roles: ["1"] }).valid).toBe(true);
    expect(validateActionInput(action, { guild_id: "10" }).valid).toBe(true);
  });
});

describe("Discord API version", () => {
  it.each([
    ["delete_guild_role", { guild_id: "10", role_id: "30" }, "https://discord.com/api/v10/guilds/10/roles/30"],
    ["create_message", { channel_id: "40", content: "hi" }, "https://discord.com/api/v10/channels/40/messages"],
  ])("pins %s to API v10", async (action, input, expected) => {
    const fetch = stubDiscord(() => Response.json({ id: "50" }));

    await run(action, input);

    expect(fetch.mock.calls[0]![0].toString()).toBe(expected);
  });

  it("keeps the proxy on the unversioned base so existing proxy paths resolve as before", async () => {
    const fetch = stubDiscord(() => Response.json({ id: "20" }));

    const result = await proxy({ method: "GET", endpoint: "/users/@me" }, context);

    expect(result.ok).toBe(true);
    expect(fetch.mock.calls[0]![0].toString()).toBe("https://discord.com/api/users/@me");
  });
});

describe("Discord error mapping", () => {
  it("reports a missing guild permission as invalid_input instead of an authorization failure", async () => {
    stubDiscord(() => Response.json({ message: "Missing Permissions", code: 50013 }, { status: 403 }));

    const result = await run("get_guild_member", { guild_id: "10", user_id: "20" });

    expect(result).toEqual({
      ok: false,
      error: { code: "invalid_input", message: "Missing Permissions", details: { status: 403 } },
    });
  });

  it("keeps a rejected bot token as authorization_failed", async () => {
    stubDiscord(() => Response.json({ message: "401: Unauthorized", code: 0 }, { status: 401 }));

    const result = await run("get_guild", { guild_id: "10" });

    expect(result).toEqual({
      ok: false,
      error: { code: "authorization_failed", message: "401: Unauthorized", details: { status: 401 } },
    });
  });
});
