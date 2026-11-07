import { describe, expect, it } from "vitest";
import { serializeRuntimeActionResult } from "../../../server/api/runtime-api.ts";
import { ProviderRequestError, toProviderExecutionError } from "../../provider-runtime.ts";
import { createFeishuJsonRequest } from "./client.ts";
import { createFeishuDocsActionHandlers } from "./docs-runtime.ts";
import { createFeishuDriveActionHandlers } from "./drive-runtime.ts";
import { createFeishuImActionHandlers } from "./im-runtime.ts";
import { createFeishuImUserActionHandlers } from "./im-user-runtime.ts";
import { createFeishuWikiActionHandlers } from "./wiki-runtime.ts";

interface ListingFixture {
  action: string;
  input: Record<string, unknown>;
  rowField: string;
  row: Record<string, unknown>;
}

const searchRow = { entity_type: "DOC", result_meta: { token: "docx_1", doc_types: "DOCX" } };
const messageRow = { message_id: "om_1", create_time: "1700000000000", body: { content: '{"text":"fixture"}' } };
const fixtures: ListingFixture[] = [
  { action: "search_documents", input: { query: "fixture" }, rowField: "res_units", row: searchRow },
  { action: "search_drive_items", input: { query: "fixture" }, rowField: "res_units", row: searchRow },
  { action: "list_drive_files", input: {}, rowField: "files", row: { token: "docx_1", type: "docx" } },
  { action: "list_wiki_spaces", input: {}, rowField: "items", row: { space_id: "space_1", name: "Fixture" } },
  { action: "list_wiki_nodes", input: { spaceId: "space_1" }, rowField: "items", row: { node_token: "node_1" } },
  {
    action: "list_wiki_members",
    input: { spaceId: "space_1" },
    rowField: "members",
    row: { member_id: "ou_1", member_type: "openid", member_role: "member" },
  },
  { action: "list_chats", input: {}, rowField: "items", row: { chat_id: "oc_1", name: "Fixture" } },
  {
    action: "list_chat_members",
    input: { chatId: "oc_1" },
    rowField: "items",
    row: { member_id: "ou_1", member_id_type: "open_id" },
  },
  {
    action: "list_messages",
    input: { containerIdType: "chat", containerId: "oc_1" },
    rowField: "items",
    row: messageRow,
  },
  { action: "list_thread_messages", input: { threadId: "omt_1" }, rowField: "items", row: messageRow },
  { action: "search_messages", input: { query: "fixture" }, rowField: "items", row: messageRow },
];

async function execute(
  action: string,
  input: Record<string, unknown>,
  data: Record<string, unknown>,
  openBaseUrl: string,
): Promise<unknown> {
  const fetcher: typeof fetch = async () => Response.json({ code: 0, msg: "success", data });
  const context = { openBaseUrl, accessToken: "fixture-only", fetcher, identity: "user" as const };
  const request = createFeishuJsonRequest(context);
  const handlers = {
    ...createFeishuDocsActionHandlers(request),
    ...createFeishuDriveActionHandlers(request),
    ...createFeishuWikiActionHandlers(request),
    ...createFeishuImUserActionHandlers(request),
    ...createFeishuImActionHandlers({ identity: "user", request, context }),
  };
  return handlers[action](input);
}

describe("Feishu listing wire failures", () => {
  it("rejects incomplete wire pages, recovers valid continuations and preserves explicit empty terminal pages", async () => {
    const openBaseUrl = "https://open.feishu.cn/open-apis";
    for (const fixture of fixtures) {
      const first = { [fixture.rowField]: [fixture.row], has_more: true, page_token: "next" };
      const resultField = fixture.action === "search_documents" ? "results" : "items";
      await expect(execute(fixture.action, fixture.input, first, openBaseUrl)).resolves.toMatchObject({
        [resultField]: [fixture.row],
        hasMore: true,
        pageToken: "next",
      });
      // A final nonempty members page must not be mistaken for omitted
      // empty items merely because has_more is false.
      await expect(
        execute(fixture.action, fixture.input, { [fixture.rowField]: [fixture.row], has_more: false }, openBaseUrl),
      ).resolves.toMatchObject({ [resultField]: [fixture.row], hasMore: false });

      for (const malformed of [
        {},
        { has_more: true, page_token: "next" },
        { has_more: "false" },
        { has_more: 0 },
        { ...first, [fixture.rowField]: null },
        { [fixture.rowField]: null, has_more: false },
        { [fixture.rowField]: {}, has_more: false },
        { ...first, [fixture.rowField]: [fixture.row, null] },
        { ...first, [fixture.rowField]: [fixture.row, "invalid"] },
        { ...first, has_more: undefined },
        { ...first, has_more: "false" },
        { ...first, has_more: 0 },
        { ...first, page_token: undefined },
        { ...first, page_token: 42 },
      ]) {
        const error = await execute(fixture.action, fixture.input, malformed, openBaseUrl).catch(
          (error: unknown) => error,
        );
        expect(error).toBeInstanceOf(ProviderRequestError);
        expect(error).toMatchObject({ status: 502 });
        // This is the real public runtime envelope the consumer receives,
        // not a successful normalized empty page or an authorization refusal.
        const response = serializeRuntimeActionResult({
          actionId: `feishu.${fixture.action}`,
          executionId: "fixture-execution",
          auditPersisted: false,
          result: toProviderExecutionError(error, "fixture request failed"),
        });
        expect(response).toMatchObject({
          status: 500,
          body: { success: false, errorCode: "provider_error", data: { status: 502 } },
        });
      }

      // Recovery passes through the same HTTP parser and action adapter.
      // Explicit exhaustion permits omitted empty rows. The terminal cursor
      // is optional too; missing rows alone never establish completion.
      for (const rows of [{ [fixture.rowField]: [] }, {}]) {
        for (const page_token of [undefined, "", null]) {
          await expect(
            execute(fixture.action, fixture.input, { ...rows, has_more: false, page_token }, openBaseUrl),
          ).resolves.toMatchObject({ [resultField]: [], hasMore: false });
        }
      }
    }

    const unsupported = { token: "sheet_1", type: "sheet" };
    await expect(
      execute("list_drive_files", {}, { files: [unsupported], has_more: true, next_page_token: "next" }, openBaseUrl),
    ).resolves.toEqual({ items: [unsupported], hasMore: true, pageToken: "next" });
    // mget is an unpaged batch and legitimately omits pagination metadata.
    await expect(
      execute("batch_get_messages", { messageIds: ["om_1"] }, { items: [messageRow] }, openBaseUrl),
    ).resolves.toEqual({ items: [messageRow], hasMore: false, pageToken: null });
  });
});
