import { describe, expect, it } from "vitest";
import { oauthClientFields } from "../core/provider-setup.ts";
import { provider as excel } from "./excel/definition.ts";
import { provider as linear } from "./linear/definition.ts";
import { provider as microsoftTeams } from "./microsoft_teams/definition.ts";
import { provider as microsoftTodo } from "./microsoft_todo/definition.ts";
import { provider as oneDrive } from "./one_drive/definition.ts";
import { provider as outlook } from "./outlook/definition.ts";
import { provider as outlookCalendar } from "./outlook_calendar/definition.ts";

// The providers whose vendor registers public clients beside confidential
// ones: the secret may be left blank, in which case the runtime sends the
// client id alone and relies on PKCE. A configuration with a secret is sent
// exactly as before, so the flag changes nothing for an existing deployment.
const optionalSecretProviders = [outlook, outlookCalendar, microsoftTeams, microsoftTodo, excel, oneDrive, linear];

describe("providers that accept a public client", () => {
  it("keep their confidential method, declare PKCE, and report the secret as optional", () => {
    for (const provider of optionalSecretProviders) {
      const auth = provider.auth.find((candidate) => candidate.type === "oauth2");
      if (!auth || auth.type !== "oauth2") throw new Error(`${provider.service}: expected an OAuth definition`);
      expect(auth.tokenEndpointAuthMethod, provider.service).toBe("client_secret_post");
      expect(auth.clientSecretOptional, provider.service).toBe(true);
      expect(auth.pkce?.method, provider.service).toBe("S256");
      expect(
        oauthClientFields(auth).find((field) => field.key === "clientSecret"),
        provider.service,
      ).toMatchObject({
        required: false,
        secret: true,
      });
    }
  });
});
