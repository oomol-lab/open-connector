import { describe, expect, it } from "vitest";
import { provider } from "./definition.ts";

describe("Feishu OAuth scopes", () => {
  it("uses the current document copy permission", () => {
    const oauth = provider.auth.find((auth) => auth.type === "oauth2");

    expect(oauth?.scopes).toContain("docs:document:copy");
    expect(oauth?.scopes).not.toContain("space:document:copy");
  });
});
