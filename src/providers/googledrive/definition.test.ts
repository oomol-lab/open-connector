import { describe, expect, it } from "vitest";
import { provider } from "./definition.ts";

const googleDriveFullScope = "https://www.googleapis.com/auth/drive";

describe("Google Drive provider definition", () => {
  it("requests only the full Drive scope required by the write action catalog", () => {
    const oauth = provider.auth.find((auth) => auth.type === "oauth2");

    expect(oauth?.scopes).toEqual([googleDriveFullScope]);
  });
});
