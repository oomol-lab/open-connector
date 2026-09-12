import { describe, expect, it } from "vitest";
import { googledriveActions } from "./actions.ts";
import { provider } from "./definition.ts";
import {
  googleDriveFullScope,
  googleDriveMetadataReadonlyScope,
  googleDriveReadonlyScope,
  googledriveReadScopes,
  googledriveWriteScopes,
} from "./scopes.ts";

function declaredScopes(): string[] {
  return provider.auth.find((auth) => auth.type === "oauth2")?.scopes ?? [];
}

describe("Google Drive provider definition", () => {
  it("declares the write scope the write action catalog requires", () => {
    expect(declaredScopes()).toContain(googleDriveFullScope);
  });

  it("declares the read-only scopes its own read actions require", () => {
    // `requestedScopes` may narrow the declared defaults but cannot add to
    // them, so a scope a caller can never request is a scope no action can be
    // authorized by. Twenty of this provider's actions declare exactly this
    // pair and nothing else -- without it here, a read-only integration has to
    // ask the user for full read-write-delete over their entire Drive.
    expect(declaredScopes()).toEqual(expect.arrayContaining(googledriveReadScopes));
  });

  it("lets a read-only caller narrow to exactly what the read actions declare", () => {
    const declared = new Set(declaredScopes());

    expect(googledriveReadScopes.every((scope) => declared.has(scope))).toBe(true);
  });

  it("declares no scope that no action asks for", () => {
    const asked = new Set(googledriveActions.flatMap((action) => action.requiredScopes ?? []));

    for (const scope of declaredScopes()) {
      expect(asked).toContain(scope);
    }
  });

  it("keeps the read and write scope sets disjoint", () => {
    // The two sets name the two halves of the catalog; an overlap would make
    // `googledriveReadScopes` a way to request write access by another name.
    const write = new Set(googledriveWriteScopes);

    expect(googledriveReadScopes.some((scope) => write.has(scope))).toBe(false);
    expect(googledriveReadScopes).toEqual([googleDriveReadonlyScope, googleDriveMetadataReadonlyScope]);
  });
});
