import { describe, expect, it } from "vitest";
import { provider } from "./definition.ts";

describe("zlibrary definition", () => {
  it("uses a custom credential with email and password fields", () => {
    const auth = provider.auth.find((auth) => auth.type === "custom_credential");

    expect(auth?.type).toBe("custom_credential");
    const fields = auth?.fields ?? [];
    expect(fields.map((field) => field.key)).toEqual(expect.arrayContaining(["email", "password"]));
    expect(fields.find((field) => field.key === "password")?.secret).toBe(true);
  });

  it("offers an optional eapi domain override field", () => {
    const auth = provider.auth.find((auth) => auth.type === "custom_credential");
    const domainField = auth?.fields.find((field) => field.key === "eapiDomain");

    expect(domainField?.required).toBe(false);
  });

  it("declares the planned actions", () => {
    const names = provider.actions.map((action) => action.name);

    expect(names).toEqual(
      expect.arrayContaining([
        "search_books",
        "get_book_metadata",
        "download_book_to_file",
        "get_download_limits",
        "get_recent_books",
      ]),
    );
  });
});
