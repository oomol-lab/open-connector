import { describe, expect, it } from "vitest";
import { parseWeixinJson } from "./runtime.ts";

describe("parseWeixinJson", () => {
  it("preserves uint64 message identifiers without changing text content", () => {
    expect(
      parseWeixinJson('{"message_id":18446744073709551615,"item_list":[{"text_item":{"text":"\\\"msg_id\\\":123"}}]}'),
    ).toEqual({
      message_id: "18446744073709551615",
      item_list: [{ text_item: { text: '"msg_id":123' } }],
    });
  });
});
