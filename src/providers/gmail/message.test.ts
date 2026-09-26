import { describe, expect, it } from "vitest";
import { normalizeGmailMessage, summarizeGmailMessage } from "./message.ts";

const headers = [
  { name: "Subject", value: "Hello" },
  { name: "From", value: "alice@example.com" },
  { name: "To", value: "bob@example.com" },
];

describe("summarizeGmailMessage", () => {
  it("keeps historyId, internalDate, sizeEstimate and snippet when Gmail sends them", () => {
    const summary = summarizeGmailMessage({
      id: "m1",
      threadId: "t1",
      labelIds: ["INBOX"],
      historyId: "12345",
      internalDate: "1758844800000",
      sizeEstimate: 4321,
      snippet: "Hi Bob",
      payload: { headers },
    });
    expect(summary).toMatchObject({
      messageId: "m1",
      threadId: "t1",
      labelIds: ["INBOX"],
      subject: "Hello",
      historyId: "12345",
      internalDate: "1758844800000",
      sizeEstimate: 4321,
      snippet: "Hi Bob",
    });
    expect(normalizeGmailMessage({ id: "m1", threadId: "t1", historyId: "12345", payload: { headers } })).toMatchObject(
      {
        historyId: "12345",
      },
    );
  });

  it("omits the optional fields when Gmail does not send them", () => {
    const summary = summarizeGmailMessage({ id: "m2", threadId: "t2", payload: { headers } });
    expect(summary).not.toHaveProperty("historyId");
    expect(summary).not.toHaveProperty("internalDate");
    expect(summary).not.toHaveProperty("sizeEstimate");
    expect(summary).not.toHaveProperty("snippet");
  });
});
