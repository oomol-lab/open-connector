import type { ProviderDefinition } from "../../core/types.ts";

import { zoomActions } from "./actions.ts";
import { zoomMeetingSummaryScopes, zoomProviderScopes } from "./scopes.ts";
import { snapshot } from "./trigger-on-recording-ready.definition.ts";
import { triggerPermissions } from "./trigger-permissions.ts";

const service = "zoom";

export const provider: ProviderDefinition = {
  service,
  triggers: [snapshot],
  triggerPermissions,
  displayName: "Zoom",
  categories: ["Communication", "Productivity"],
  authTypes: ["oauth2"],
  auth: [
    {
      type: "oauth2",
      requiredScopes: ["user:read:user"],
      authorizationUrl: "https://zoom.us/oauth/authorize",
      tokenUrl: "https://zoom.us/oauth/token",
      refreshTokenUrl: "https://zoom.us/oauth/token",
      scopes: zoomProviderScopes,
      authorizationOptions: [
        "cloud_recording:read:recording",
        "cloud_recording:read:recording:admin",
        ...zoomMeetingSummaryScopes,
      ].map((id) => ({ id, label: id, description: "", risk: "standard" as const })),
      tokenEndpointAuthMethod: "client_secret_basic",
    },
  ],
  homepageUrl: "https://www.zoom.com",
  actions: zoomActions,
};
