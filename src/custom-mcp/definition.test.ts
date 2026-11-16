import { expect, it } from "vitest";
import { readMcpOAuthClientMetadata } from "./definition.ts";

it("uses the default client name when the settings are blank", () => {
  expect(readMcpOAuthClientMetadata({ clientName: "  " })).toEqual({
    clientName: "OOMOL Connect",
    logoUri: undefined,
    clientUri: undefined,
  });
});

it("trims the configured client name and links", () => {
  expect(
    readMcpOAuthClientMetadata({
      clientName: " Acme Support ",
      logoUri: " https://acme.example/logo.png ",
      clientUri: "https://acme.example",
    }),
  ).toEqual({
    clientName: "Acme Support",
    logoUri: "https://acme.example/logo.png",
    clientUri: "https://acme.example",
  });
});

it("rejects links that are not https URLs", () => {
  expect(() => readMcpOAuthClientMetadata({ logoUri: "http://acme.example/logo.png" })).toThrow(
    "OOMOL_CONNECT_CUSTOM_MCP_CLIENT_LOGO_URI must be an https URL.",
  );
  expect(() => readMcpOAuthClientMetadata({ clientUri: "acme.example" })).toThrow(
    "OOMOL_CONNECT_CUSTOM_MCP_CLIENT_URI must be an https URL.",
  );
});
