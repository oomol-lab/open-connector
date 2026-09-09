import { describe, expect, it, vi } from "vitest";
import { credentialValidators } from "./executors.ts";
import { cursorActionHandlers as handlers, validateCursorCredential } from "./runtime.ts";

describe("Cursor requests", () => {
  it("preserves the existing admin response envelope", async () => {
    const payload = { teamMembers: [{ id: "user_1", email: "dev@example.com" }] };
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json(payload));
    await expect(handlers.list_team_members({}, { apiKey: "key", fetcher })).resolves.toEqual({
      teamMembers: payload.teamMembers,
      raw: payload,
    });
    expect(String(fetcher.mock.calls[0]![0])).toBe("https://api.cursor.com/teams/members");
  });

  it("preserves admin request bodies and spending fields", async () => {
    const input = { searchTerm: "dev", sortBy: "amount", page: 2 };
    const payload = { teamMemberSpend: [], subscriptionCycleStart: 123, totalMembers: 0, totalPages: 0 };
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json(payload));
    await expect(handlers.get_team_spend(input, { apiKey: "key", fetcher })).resolves.toEqual({
      ...payload,
      raw: payload,
    });
    expect(JSON.parse(String(fetcher.mock.calls[0]![1]?.body))).toEqual(input);
    expect(fetcher.mock.calls[0]![1]?.method).toBe("POST");
  });

  it("retains flat admin error messages through the shared transport", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json({ message: "Admin access required" }, { status: 403 }));
    await expect(handlers.list_team_members({}, { apiKey: "key", fetcher })).rejects.toMatchObject({
      status: 403,
      message: "Admin access required",
    });
  });

  it("submits a follow-up without leaking routing fields into the body", async () => {
    const payload = { run: { id: "run-next", status: "CREATING" } };
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json(payload));
    const mcpServers = [
      { name: "tools", url: "https://example.com/mcp", headers: { Authorization: "Bearer tool-key" } },
    ];
    const result = await handlers.create_run(
      { agentId: "bc-session", prompt: { text: "  Keep whitespace.\n" }, mode: "plan", mcpServers },
      { apiKey: "clé", fetcher },
    );
    expect(result).toEqual(payload);
    const [url, init] = fetcher.mock.calls[0]!;
    expect(String(url)).toBe("https://api.cursor.com/v1/agents/bc-session/runs");
    expect(init?.method).toBe("POST");
    expect(new Headers(init?.headers).get("authorization")).toBe("Basic Y2zDqTo=");
    expect(JSON.parse(String(init?.body))).toEqual({
      prompt: { text: "  Keep whitespace.\n" },
      mode: "plan",
      mcpServers,
    });
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });

  it("preserves false filters and opaque pagination cursors", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ items: [], nextCursor: "next" }));
    await expect(
      handlers.list_agents({ limit: 5, cursor: "a+/=?", includeArchived: false }, { apiKey: "key", fetcher }),
    ).resolves.toEqual({ items: [], nextCursor: "next" });
    const url = new URL(String(fetcher.mock.calls[0]![0]));
    expect(url.searchParams.get("cursor")).toBe("a+/=?");
    expect(url.searchParams.get("includeArchived")).toBe("false");
    expect(url.searchParams.get("limit")).toBe("5");
  });

  it("rejects URL dot segments before making a request", () => {
    const fetcher = vi.fn<typeof fetch>();
    for (const agentId of [".", ".."])
      expect(() => handlers.get_agent({ agentId }, { apiKey: "key", fetcher })).toThrow("dot segment");
    expect(() => handlers.get_run({ agentId: "bc-session", runId: ".." }, { apiKey: "key", fetcher })).toThrow("runId");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("encodes IDs as single path segments", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ id: "run-1" }));
    await handlers.cancel_run({ agentId: "bc-a/b?c", runId: "run-a/b#c" }, { apiKey: "key", fetcher });
    expect(String(fetcher.mock.calls[0]![0])).toBe(
      "https://api.cursor.com/v1/agents/bc-a%2Fb%3Fc/runs/run-a%2Fb%23c/cancel",
    );
  });

  it.each([401, 403, 404, 409, 429, 503])(
    "preserves execute-phase HTTP %s and upstream error details",
    async (status) => {
      const payload = { error: { code: "upstream_code", message: "Upstream message" } };
      const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json(payload, { status }));
      await expect(handlers.list_agents({}, { apiKey: "key", fetcher })).rejects.toMatchObject({
        status,
        message: "Upstream message",
        details: payload,
      });
    },
  );

  it("preserves authorization failure for non-JSON error responses", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response("Unauthorized", { status: 401 }));
    await expect(handlers.list_models({}, { apiKey: "key", fetcher })).rejects.toMatchObject({ status: 401 });
  });

  it("rejects malformed success responses", async () => {
    for (const response of [new Response("not json"), Response.json([]), new Response(null)]) {
      const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response);
      await expect(handlers.list_models({}, { apiKey: "key", fetcher })).rejects.toMatchObject({ status: 502 });
    }
  });
});

describe("Cursor credentials", () => {
  it("validates a user key without requesting team data", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ userId: 42, apiKeyName: "Development" }));
    await expect(credentialValidators.apiKey!({ apiKey: "key", values: {} }, { fetcher })).resolves.toMatchObject({
      profile: { accountId: "42" },
    });
    expect(fetcher).toHaveBeenCalledOnce();
    expect(String(fetcher.mock.calls[0]![0])).toBe("https://api.cursor.com/v1/me");
  });

  it("accepts an admin-only key without attributing it to a team member", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ error: "Forbidden" }, { status: 403 }))
      .mockResolvedValueOnce(Response.json({ teamMembers: [{ id: "user_1", email: "someone@example.com" }] }));
    await expect(credentialValidators.apiKey!({ apiKey: "key", values: {} }, { fetcher })).resolves.toEqual({
      profile: { accountId: "cursor:team", grantedScopes: ["admin:*"] },
    });
    expect(fetcher.mock.calls.map(([url]) => new URL(String(url)).pathname)).toEqual(["/v1/me", "/teams/members"]);
  });

  it.each([400, 404, 429, 503])("does not probe another API after validation HTTP %s", async (status) => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ error: "Unavailable" }, { status }));
    await expect(credentialValidators.apiKey!({ apiKey: "key", values: {} }, { fetcher })).rejects.toMatchObject({
      status,
    });
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it.each([401, 403])("maps validation HTTP %s to a credential field error", async (status) => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockImplementation(async () => Response.json({ error: "Invalid key" }, { status }));
    await expect(validateCursorCredential("key", fetcher)).rejects.toMatchObject({
      status: 400,
      message: "Invalid key",
    });
    expect(String(fetcher.mock.calls[0]![0])).toBe("https://api.cursor.com/v1/me");
  });

  it("uses the authenticated user ID rather than a team member's identity", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json({ userId: 42, userEmail: "dev@example.com", apiKeyName: "Development" }));
    await expect(validateCursorCredential("key", fetcher)).resolves.toEqual({
      profile: { accountId: "42", displayName: "dev@example.com" },
    });
  });

  it("accepts service account keys without inventing a user identity", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json({ apiKeyName: "Automation", createdAt: "2026-09-01T00:00:00Z" }));
    await expect(validateCursorCredential("key", fetcher)).resolves.toEqual({
      profile: { accountId: undefined, displayName: "Automation" },
    });
  });
});
