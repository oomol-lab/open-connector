import { describe, expect, it } from "vitest";
import { provider } from "./definition.ts";

const googleDriveReadonlyScope = "https://www.googleapis.com/auth/drive.readonly";

describe("Google Drive provider definition", () => {
  it("requests only read-only Drive access for the OpenMeld production baseline", () => {
    const oauth = provider.auth.find((auth) => auth.type === "oauth2");

    expect(oauth?.scopes).toEqual([googleDriveReadonlyScope]);
  });
});
