import { describe, expect, it } from "vitest";
import { provider as gmail } from "./gmail/definition.ts";
import { provider as googlecalendar } from "./googlecalendar/definition.ts";
import { provider as googledocs } from "./googledocs/definition.ts";
import { provider as googledrive } from "./googledrive/definition.ts";
import { provider as googlesheets } from "./googlesheets/definition.ts";
import { provider as googleslides } from "./googleslides/definition.ts";

const googleProviders = [gmail, googlecalendar, googledocs, googlesheets, googleslides, googledrive];

function oauth(provider: (typeof googleProviders)[number]) {
  const auth = provider.auth.find((candidate) => candidate.type === "oauth2");
  if (auth?.type !== "oauth2") {
    throw new Error(`${provider.service} must keep an oauth2 auth method`);
  }
  return auth;
}

describe("Google provider definitions", () => {
  it.each(googleProviders.map((provider) => [provider.service, provider] as const))(
    "%s declares Google's revocation endpoint beside its token endpoint",
    (_service, provider) => {
      const auth = oauth(provider);

      expect(auth.revocationUrl).toBe("https://oauth2.googleapis.com/revoke");
    },
  );
});
