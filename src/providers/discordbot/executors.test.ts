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

  it("limits the topic to 1024 characters unless the channel is a forum or media channel", async () => {
    const fetch = stubDiscord(() => Response.json({ id: "30" }));

    for (const type of [undefined, 0, 5]) {
      await expect(
        run("create_guild_channel", { guild_id: "10", name: "c", type, topic: "a".repeat(1025) }),
      ).resolves.toMatchObject({
        ok: false,
        error: {
          code: "invalid_input",
          message: "topic must be at most 1024 characters unless type is 15 (forum) or 16 (media)",
        },
      });
    }
    expect(fetch).not.toHaveBeenCalled();

    const accepted: Array<[number, string]> = [
      [0, "a".repeat(1024)],
      [15, "a".repeat(1025)],
      [16, "a".repeat(4096)],
    ];
    for (const [type, topic] of accepted) {
      await expect(run("create_guild_channel", { guild_id: "10", name: "c", type, topic })).resolves.toMatchObject({
        ok: true,
      });
    }
    expect(fetch).toHaveBeenCalledTimes(3);
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
  it("rejects an empty include_roles list for get_guild_prune_count", () => {
    const action = discordbotGuildActions.find((candidate) => candidate.name === "get_guild_prune_count")!;

    expect(validateActionInput(action, { guild_id: "10", include_roles: [] }).valid).toBe(false);
    expect(validateActionInput(action, { guild_id: "10", include_roles: ["1"] }).valid).toBe(true);
    expect(validateActionInput(action, { guild_id: "10" }).valid).toBe(true);
  });

  // Forum and media channels hold post guidelines in the topic, which Discord allows up
  // to 4096 characters; the executor enforces the 1024 limit of every other type.
  it("accepts a forum channel topic up to 4096 characters for create_guild_channel", () => {
    const action = discordbotGuildActions.find((candidate) => candidate.name === "create_guild_channel")!;

    expect(validateActionInput(action, { guild_id: "10", name: "f", type: 15, topic: "a".repeat(4096) }).valid).toBe(
      true,
    );
    expect(validateActionInput(action, { guild_id: "10", name: "f", type: 15, topic: "a".repeat(4097) }).valid).toBe(
      false,
    );
  });

  // Begin Guild Prune takes include_roles as a JSON array in the body, so an empty
  // array is still a valid snowflake list and matches the documented default of none.
  it("sends an empty include_roles list in the begin_guild_prune body", async () => {
    const action = discordbotGuildActions.find((candidate) => candidate.name === "begin_guild_prune")!;
    const input = { guild_id: "10", days: 7, include_roles: [] };
    expect(validateActionInput(action, input).valid).toBe(true);
    const fetch = stubDiscord(() => Response.json({ pruned: 2 }));

    const result = await run("begin_guild_prune", input);

    expect(result).toEqual({ ok: true, output: { pruned: 2 } });
    const [url, init] = fetch.mock.calls[0]!;
    expect(url.toString()).toBe("https://discord.com/api/v10/guilds/10/prune");
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init?.body))).toEqual({ days: 7, include_roles: [] });
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
      error: {
        code: "invalid_input",
        message: "Missing Permissions",
        details: { status: 403, details: { code: 50013 } },
      },
    });
  });

  it("keeps a rejected bot token as authorization_failed", async () => {
    stubDiscord(() => Response.json({ message: "401: Unauthorized", code: 0 }, { status: 401 }));

    const result = await run("get_guild", { guild_id: "10" });

    expect(result).toEqual({
      ok: false,
      error: {
        code: "authorization_failed",
        message: "401: Unauthorized",
        details: { status: 401, details: { code: 0 } },
      },
    });
  });

  // Since API v8 a form error's message is only "Invalid Form Body"; the field that
  // failed and the reason are nested under `errors`, with array items keyed by index.
  it("keeps Discord's field-level form errors in the message and details", async () => {
    const errors = {
      name: { _errors: [{ code: "BASE_TYPE_BAD_LENGTH", message: "Must be between 1 and 100 in length." }] },
      permission_overwrites: {
        "0": { type: { _errors: [{ code: "BASE_TYPE_CHOICES", message: "Value must be one of {0, 1}." }] } },
      },
    };
    stubDiscord(() => Response.json({ code: 50035, errors, message: "Invalid Form Body" }, { status: 400 }));

    const result = await run("create_guild_channel", {
      guild_id: "10",
      name: "x".repeat(100),
      permission_overwrites: [{ id: "20", type: 5 }],
    });

    expect(result).toEqual({
      ok: false,
      error: {
        code: "invalid_input",
        message:
          "Invalid Form Body: name: Must be between 1 and 100 in length.; permission_overwrites.0.type: Value must be one of {0, 1}.",
        details: { status: 400, details: { code: 50035, errors } },
      },
    });
  });

  it("reports a request-level form error without a field path", async () => {
    const errors = {
      _errors: [{ code: "APPLICATION_COMMAND_TOO_LARGE", message: "Command exceeds maximum size (8000)" }],
    };
    stubDiscord(() => Response.json({ code: 50035, message: "Invalid Form Body", errors }, { status: 400 }));

    const result = await run("create_message", { channel_id: "40", content: "hi" });

    expect(result).toMatchObject({
      ok: false,
      error: { message: "Invalid Form Body: Command exceeds maximum size (8000)" },
    });
  });

  it("keeps retry_after from a rate-limited response", async () => {
    stubDiscord(() =>
      Response.json({ message: "You are being rate limited.", retry_after: 1.5, global: false }, { status: 429 }),
    );

    const result = await run("get_guild", { guild_id: "10" });

    expect(result).toEqual({
      ok: false,
      error: {
        code: "rate_limited",
        message: "You are being rate limited.",
        details: { status: 429, details: { retry_after: 1.5 } },
      },
    });
  });
});
