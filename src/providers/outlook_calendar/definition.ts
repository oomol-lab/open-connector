import type { ProviderDefinition } from "../../core/types.ts";

import { outlookCalendarActions } from "./actions.ts";
import { outlookCalendarOAuthScopes } from "./scopes.ts";

/**
 * Outlook Calendar provider backed by Microsoft Graph calendar APIs.
 */
export const provider: ProviderDefinition = {
  service: "outlook_calendar",
  displayName: "Outlook Calendar",
  description: "Read and manage Microsoft 365 calendars, events, availability, and meeting responses.",
  categories: ["Productivity"],
  authTypes: ["oauth2"],
  auth: [
    {
      type: "oauth2",
      authorizationUrl: "https://login.microsoftonline.com/{tenant}/oauth2/v2.0/authorize",
      tokenUrl: "https://login.microsoftonline.com/{tenant}/oauth2/v2.0/token",
      scopes: outlookCalendarOAuthScopes,
      tokenEndpointAuthMethod: "none",
      pkce: { method: "S256" },
      authorizationParams: { response_mode: "query" },
      clientConfigFields: [
        {
          key: "tenant",
          label: "Tenant",
          inputType: "text",
          required: true,
          secret: false,
          defaultValue: "common",
          placeholder: "common",
          description:
            "The Microsoft identity platform tenant segment, such as common, organizations, consumers, or a tenant ID.",
        },
      ],
      clientSetup: {
        docsUrl: "https://learn.microsoft.com/en-us/entra/identity-platform/quickstart-register-app",
        steps: [
          "Register an application in Microsoft Entra ID.",
          "Add the Microsoft Graph delegated permissions User.Read, Calendars.ReadWrite, Calendars.ReadWrite.Shared, and offline_access; the Shared permission enables delegated and shared calendars, and tenant policy may require administrator consent.",
          "Add the Mobile and desktop applications platform with the callback URL shown by this runtime and allow public client flows; the runtime redeems codes with PKCE, so save only the application client ID and leave Client Secret empty.",
        ],
      },
    },
  ],
  homepageUrl: "https://www.microsoft.com/microsoft-365/outlook/outlook-calendar",
  actions: outlookCalendarActions,
};
