import type { ProviderDefinition } from "../../core/types.ts";

import { googlecalendarActions } from "./actions.ts";
import { googlecalendarOAuthScopes } from "./scopes.ts";

const service = "googlecalendar";

/**
 * Google Calendar provider backed by the Calendar API and a user-provided Google OAuth app.
 */
export const provider: ProviderDefinition = {
  service,
  displayName: "Google Calendar",
  categories: ["Productivity", "Communication"],
  authTypes: ["oauth2"],
  auth: [
    {
      type: "oauth2",
      authorizationUrl: "https://accounts.google.com/o/oauth2/v2/auth",
      tokenUrl: "https://oauth2.googleapis.com/token",
      scopes: googlecalendarOAuthScopes,
      tokenEndpointAuthMethod: "client_secret_post",
      authorizationParams: {
        access_type: "offline",
        prompt: "consent",
      },
    },
  ],
  homepageUrl: "https://workspace.google.com/products/calendar/",
  actions: googlecalendarActions,
};
