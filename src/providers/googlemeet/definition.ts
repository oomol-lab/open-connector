import type { ProviderDefinition } from "../../core/types.ts";

import { googleMeetActions } from "./actions.ts";
import { googleMeetAuthorizationUrl, googleMeetHomepageUrl, googleMeetTokenUrl } from "./constants.ts";
import { googleMeetOAuthScopes } from "./scopes.ts";

const service = "googlemeet";

/**
 * Google Meet provider backed by the Meet REST API and a user-provided Google OAuth app.
 */
export const provider: ProviderDefinition = {
  service,
  displayName: "Google Meet",
  description:
    "Create and manage Google Meet spaces, then read conference records, participants, recordings, transcripts, and smart notes.",
  categories: ["Communication", "Productivity"],
  authTypes: ["oauth2"],
  auth: [
    {
      type: "oauth2",
      authorizationUrl: googleMeetAuthorizationUrl,
      tokenUrl: googleMeetTokenUrl,
      scopes: googleMeetOAuthScopes,
      tokenEndpointAuthMethod: "client_secret_post",
      authorizationParams: {
        access_type: "offline",
        prompt: "consent",
      },
    },
  ],
  homepageUrl: googleMeetHomepageUrl,
  actions: googleMeetActions,
};
