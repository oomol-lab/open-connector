import { describe, expect, it } from "vitest";
import { provider } from "./definition.ts";

const gmailSettingsSharingScope = "https://www.googleapis.com/auth/gmail.settings.sharing";
const gmailSettingsBasicScope = "https://www.googleapis.com/auth/gmail.settings.basic";

describe("Gmail provider definition", () => {
  it("does not request the Workspace administrator-only sharing scope for user OAuth", () => {
    const oauth = provider.auth.find((auth) => auth.type === "oauth2");

    expect(oauth?.scopes).not.toContain(gmailSettingsSharingScope);
  });

  it("uses a user-authorizable scope for forwarding read actions", () => {
    const forwardingReadActions = provider.actions.filter((action) =>
      ["get_auto_forwarding", "list_forwarding_addresses"].includes(action.name),
    );

    expect(forwardingReadActions).toHaveLength(2);
    for (const action of forwardingReadActions) {
      expect(action.requiredScopes).toEqual([gmailSettingsBasicScope]);
    }
  });
});
