import type { CredentialDefinition } from "./types.ts";

import { describe, expect, it } from "vitest";
import { normalizeCredentialValues } from "./credential-fields.ts";

const fields: CredentialDefinition[] = [
  { key: "host", label: "Host", inputType: "text", required: true, secret: false },
  { key: "password", label: "Password", inputType: "password", required: true, secret: true },
  { key: "passphrase", label: "Passphrase", inputType: "password", required: false, secret: true },
];
const normalize = (values: Record<string, unknown>) =>
  normalizeCredentialValues({ fields, values, preserveSecrets: true, createError: (message) => new Error(message) });

describe("credential field normalization", () => {
  it("retains default trimming for API key and OAuth callers", () => {
    expect(
      normalizeCredentialValues({
        fields,
        values: { host: " example.com ", password: " secret " },
        createError: (message) => new Error(message),
      }),
    ).toEqual({ host: "example.com", password: "secret" });
  });
  it("preserves secrets while trimming non-secret values", () => {
    expect(normalize({ host: " example.com ", password: " secret ", passphrase: " phrase\n" })).toEqual({
      host: "example.com",
      password: " secret ",
      passphrase: " phrase\n",
    });
  });

  it("accepts whitespace-only secrets", () => {
    expect(normalize({ host: "example.com", password: "  " }).password).toBe("  ");
  });

  it.each(["", undefined, 42])("rejects an absent or non-string required secret: %j", (password) => {
    expect(() => normalize({ host: "example.com", password })).toThrow("password is required");
  });

  it("still rejects blank non-secret required fields and unknown fields", () => {
    expect(() => normalize({ host: " ", password: "secret" })).toThrow("host is required");
    expect(() => normalize({ host: "example.com", password: "secret", unknown: "value" })).toThrow(
      "Unexpected credential field: unknown",
    );
  });

  it("omits empty optional secrets", () => {
    expect(normalize({ host: "example.com", password: "secret", passphrase: "" })).toEqual({
      host: "example.com",
      password: "secret",
    });
  });
});
