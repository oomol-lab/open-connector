import { describe, expect, it } from "vitest";
import { credentialValidators, retellAiActionHandlers as handlers } from "./executors.ts";

const agent = {
  agent_id: "agent-1",
  agent_name: "Support",
  channel: "voice",
  user_modified_timestamp: 1700000000000,
  tags: { prod: { version: 2, dynamic_variables: { greeting: "Hello" } } },
};

describe("Retell AI list migration", () => {
  it("lists voice summaries and follows an opaque cursor to the last page", async () => {
    const cursor = "next+/= cursor";
    let requests = 0;
    const context = {
      apiKey: "test-key",
      fetcher: async (url: RequestInfo | URL, init?: RequestInit) => {
        const target = new URL(url.toString());
        expect(target.pathname).toBe("/v2/list-agents");
        expect(init?.method).toBe("POST");
        expect(new Headers(init?.headers).get("authorization")).toBe("Bearer test-key");
        expect(new Headers(init?.headers).get("content-type")).toBe("application/json");
        expect(JSON.parse(String(init?.body))).toEqual({
          filter_criteria: { channel: { type: "string", op: "eq", value: "voice" } },
        });
        expect(Object.fromEntries(target.searchParams)).toEqual(
          requests === 0
            ? { limit: "1", sort_order: "ascending" }
            : { limit: "1", sort_order: "ascending", pagination_key: cursor },
        );
        return Response.json(
          requests++ === 0
            ? { items: [agent], has_more: true, pagination_key: cursor }
            : { items: [], has_more: false },
        );
      },
    };
    const first = await handlers.list_voice_agents({ limit: 1, sortOrder: "ascending" }, context);
    expect(first).toEqual({
      agents: [
        {
          agentId: "agent-1",
          agentName: "Support",
          channel: "voice",
          userModifiedTimestamp: agent.user_modified_timestamp,
          tags: agent.tags,
          raw: agent,
        },
      ],
      hasMore: true,
      paginationKey: cursor,
      raw: { items: [agent], has_more: true, pagination_key: cursor },
    });
    const second = await handlers.list_voice_agents(
      { limit: 1, sortOrder: "ascending", paginationKey: (first as Record<string, unknown>).paginationKey },
      context,
    );
    expect(second).toEqual({ agents: [], hasMore: false, paginationKey: null, raw: { items: [], has_more: false } });
    expect(requests).toBe(2);
  });

  it.each([[], { has_more: false }, { items: [], has_more: "false" }, { items: [null], has_more: false }])(
    "rejects malformed list envelopes instead of reporting an empty result: %j",
    async (payload) => {
      await expect(
        handlers.list_voice_agents({}, { apiKey: "key", fetcher: async () => Response.json(payload) }),
      ).rejects.toMatchObject({ status: 502 });
    },
  );

  it("keeps version details on the get action", async () => {
    const result = await handlers.get_voice_agent(
      { agentId: "agent-1", version: 0 },
      {
        apiKey: "key",
        fetcher: async (url, init) => {
          expect(url.toString()).toBe("https://api.retellai.com/get-agent/agent-1?version=0");
          expect(init?.method).toBe("GET");
          return Response.json({
            agent_id: "agent-1",
            version: 0,
            voice_id: "voice-1",
            is_published: false,
            last_modification_timestamp: 123,
          });
        },
      },
    );
    expect(result).toMatchObject({
      agent: { version: 0, voiceId: "voice-1", isPublished: false, lastModificationTimestamp: 123 },
    });
  });

  it("uses typed enum filters for every supported call filter", async () => {
    const result = await handlers.list_calls(
      {
        agentIds: ["agent-1"],
        callIds: ["call-1"],
        callStatuses: ["ended"],
        callTypes: ["phone_call"],
        directions: ["outbound"],
        includeTotal: false,
        skip: 0,
      },
      {
        apiKey: "key",
        fetcher: async (url, init) => {
          expect(url.toString()).toBe("https://api.retellai.com/v3/list-calls");
          expect(init?.method).toBe("POST");
          expect(JSON.parse(String(init?.body))).toEqual({
            include_total: false,
            skip: 0,
            filter_criteria: {
              agent: [{ agent_id: "agent-1" }],
              call_id: { type: "enum", op: "in", value: ["call-1"] },
              call_status: { type: "enum", op: "in", value: ["ended"] },
              call_type: { type: "enum", op: "in", value: ["phone_call"] },
              direction: { type: "enum", op: "in", value: ["outbound"] },
            },
          });
          return Response.json({ items: [], has_more: false, total: 0 });
        },
      },
    );
    expect(result).toMatchObject({ calls: [], hasMore: false, paginationKey: null, total: 0 });
  });

  it.each([401, 403, 429, 500])("preserves upstream status %i during execution", async (status) => {
    await expect(
      handlers.list_voice_agents(
        {},
        { apiKey: "key", fetcher: async () => Response.json({ message: "Upstream failure" }, { status }) },
      ),
    ).rejects.toMatchObject({ status, message: "Upstream failure" });
  });

  it("keeps credential validation on list-voices with form-friendly errors", async () => {
    await expect(
      credentialValidators.apiKey!(
        { apiKey: "key", values: {} },
        {
          fetcher: async (url) => {
            expect(url.toString()).toBe("https://api.retellai.com/list-voices");
            return Response.json({ message: "Invalid key" }, { status: 401 });
          },
        },
      ),
    ).rejects.toMatchObject({ status: 400, message: "Invalid key" });
  });

  it("maps request timeouts through the shared runtime", async () => {
    await expect(
      handlers.list_voice_agents(
        {},
        {
          apiKey: "key",
          fetcher: async () => {
            throw new DOMException("Timed out", "TimeoutError");
          },
        },
      ),
    ).rejects.toMatchObject({ status: 504 });
  });
});
