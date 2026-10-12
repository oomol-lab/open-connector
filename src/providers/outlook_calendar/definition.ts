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
      tokenEndpointAuthMethod: "client_secret_post",
      clientSecretOptional: true,
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
          "Register an application in Microsoft Entra ID and add the callback URL shown by this runtime: under the Web platform to use a client secret, or under Mobile and desktop applications (with public client flows allowed) to use none.",
          "Add the Microsoft Graph delegated permissions User.Read, Calendars.ReadWrite, Calendars.ReadWrite.Shared, and offline_access; the Shared permission enables delegated and shared calendars, and tenant policy may require administrator consent.",
          "Save the application client ID in this runtime, with a client secret for a Web platform registration or with the secret left blank for a Mobile and desktop registration.",
        ],
      },
    },
  ],
  homepageUrl: "https://www.microsoft.com/microsoft-365/outlook/outlook-calendar",
  actions: outlookCalendarActions,
};
