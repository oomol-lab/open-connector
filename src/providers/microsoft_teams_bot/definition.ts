import type { ProviderDefinition } from "../../core/types.ts";

import { microsoftTeamsBotActions } from "./actions.ts";

const service = "microsoft_teams_bot";

/**
 * Microsoft Teams bot provider backed by the Bot Framework Connector REST API.
 */
export const provider: ProviderDefinition = {
  service,
  displayName: "Microsoft Teams Bot",
  categories: ["Communication"],
  authTypes: ["custom_credential"],
  auth: [
    {
      type: "custom_credential",
      fields: [
        {
          key: "appId",
          label: "Application (client) ID",
          inputType: "text",
          required: true,
          secret: false,
          description:
            "The Microsoft Entra application (client) ID of the Azure Bot registration. Find it on the app registration overview page in the Azure portal.",
        },
        {
          key: "clientSecret",
          label: "Client secret",
          inputType: "password",
          required: true,
          secret: true,
          description:
            "A client secret value of that app registration. Create one under Certificates & secrets and copy the value, not the secret ID.",
        },
        {
          key: "tenantId",
          label: "Tenant ID",
          inputType: "text",
          required: true,
          secret: false,
          description:
            "The tenant used as the token authority. A single-tenant bot uses its own directory (tenant) ID; a multi-tenant bot uses botframework.com (public cloud) or MicrosoftServices.onmicrosoft.us (GCC High and DoD).",
        },
        {
          key: "serviceUrl",
          label: "Default service URL",
          inputType: "text",
          required: false,
          secret: false,
          placeholder: "https://smba.trafficmanager.net/teams/",
          description:
            "Optional fallback Bot Connector endpoint used when an action does not pass serviceUrl. Only Microsoft Teams Bot Connector hosts are accepted (public cloud, GCC, GCC High, DoD). Set this field when connecting a GCC High or DoD bot so token validation uses the government cloud.",
        },
      ],
    },
  ],
  homepageUrl: "https://learn.microsoft.com/en-us/azure/bot-service/",
  actions: microsoftTeamsBotActions,
};
