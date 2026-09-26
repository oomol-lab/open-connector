import { describe, expect, it } from "vitest";
import { oauthClientFields } from "../core/provider-setup.ts";
import { provider as excel } from "./excel/definition.ts";
import { provider as microsoftTeams } from "./microsoft_teams/definition.ts";
import { provider as microsoftTodo } from "./microsoft_todo/definition.ts";
import { provider as oneDrive } from "./one_drive/definition.ts";
import { provider as outlook } from "./outlook/definition.ts";
import { provider as outlookCalendar } from "./outlook_calendar/definition.ts";

const microsoftProviders = [outlook, outlookCalendar, microsoftTeams, microsoftTodo, excel, oneDrive];

function oauth(provider: (typeof microsoftProviders)[number]) {
  const auth = provider.auth.find((candidate) => candidate.type === "oauth2");
  if (auth?.type !== "oauth2") {
    throw new Error(`${provider.service} must keep an oauth2 auth method`);
  }
  return auth;
}

// The Microsoft identity platform forbids a secret when a public client (a
// Mobile and desktop applications redirect) redeems an authorization code, and
// a native app must not ship one. Every Microsoft Graph provider therefore
// authenticates the token request with PKCE alone.
describe("Microsoft Graph provider definitions", () => {
  it.each(microsoftProviders.map((provider) => [provider.service, provider] as const))(
    "%s is a public client that redeems codes with PKCE and no secret",
    (_service, provider) => {
      const auth = oauth(provider);

      expect(auth.tokenEndpointAuthMethod).toBe("none");
      expect(auth.pkce).toEqual({ method: "S256" });
      expect(auth.tokenUrl).toBe("https://login.microsoftonline.com/{tenant}/oauth2/v2.0/token");
      expect(auth).not.toHaveProperty("refreshTokenUrl");
    },
  );

  it.each(microsoftProviders.map((provider) => [provider.service, provider] as const))(
    "%s does not require a client secret from hosts",
    (_service, provider) => {
      const secretField = oauthClientFields(oauth(provider)).find((field) => field.key === "clientSecret");

      expect(secretField?.required).toBe(false);
    },
  );

  it("tells hosts to register a Mobile and desktop redirect instead of creating a secret", () => {
    for (const provider of [outlookCalendar, microsoftTeams]) {
      const steps = oauth(provider).clientSetup?.steps ?? [];

      expect(steps.some((step) => /Mobile and desktop applications/.test(step))).toBe(true);
      expect(steps.some((step) => /create a client secret/i.test(step))).toBe(false);
      expect(steps.some((step) => /web application/i.test(step))).toBe(false);
    }
  });
});
