import type { QqMailCredential } from "./protocol.ts";

import { describe, expect, it, vi } from "vitest";
import { createQqMailProtocol } from "./protocol.ts";

const credential: QqMailCredential = {
  email: "user@qq.com",
  authorizationCode: "abcdefghijklmnop",
};

describe("qq mail protocol", () => {
  it("maps missing downloaded attachments to a client UID error", async () => {
    const client = createImapClient({
      download: vi.fn(async () => {
        throw Object.assign(new Error("attachment not found"), { code: "NotFound" });
      }),
    });
    const protocol = createQqMailProtocol({
      createImapClient: () => client,
    });

    await expect(protocol.downloadAttachment(credential, "INBOX", 123, "2")).rejects.toMatchObject({
      kind: "uid_not_found",
    });
  });

  it("maps missing move targets to a client folder error", async () => {
    const client = createImapClient({
      messageMove: vi.fn(async () => {
        throw Object.assign(new Error("Mailbox does not exist"), { code: "NONEXISTENT" });
      }),
    });
    const protocol = createQqMailProtocol({
      createImapClient: () => client,
    });

    await expect(protocol.moveMessage(credential, "INBOX", 123, "Archive")).rejects.toMatchObject({
      kind: "folder_not_found",
    });
  });
});

function createImapClient(overrides: Record<string, unknown>) {
  return {
    connect: vi.fn(async () => {}),
    logout: vi.fn(async () => {}),
    list: vi.fn(async () => []),
    mailboxOpen: vi.fn(async () => ({})),
    ...overrides,
  };
}
