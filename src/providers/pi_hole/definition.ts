import type { ProviderDefinition } from "../../core/types.ts";

import { piHoleActions } from "./actions.ts";

const service = "pi_hole";

/**
 * Pi-hole provider backed by a user-configured Pi-hole instance.
 */
export const provider: ProviderDefinition = {
  service,
  displayName: "Pi-hole",
  categories: ["Infrastructure"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "Application Password",
      placeholder: "PI_HOLE_APP_PASSWORD",
      description:
        "Pi-hole application password used to authenticate against the instance API. Use an application password, not your account password, because application passwords bypass two-factor authentication. Create one from your Pi-hole web interface under Settings -> All settings -> API.",
      extraFields: [
        {
          key: "baseUrl",
          label: "Instance Base URL",
          inputType: "text",
          required: true,
          secret: false,
          placeholder: "http://pi.hole",
          description:
            "The root URL for your Pi-hole instance, for example http://pi.hole or https://pi.hole:8443. The API is served below this root.",
        },
        {
          key: "apiPath",
          label: "API Path",
          inputType: "text",
          required: false,
          secret: false,
          placeholder: "api",
          description:
            "The URL path below the instance root where the Pi-hole API is served, normally api. Change this only when a reverse proxy rewrites the API to a different subpath.",
        },
      ],
    },
  ],
  homepageUrl: "https://pi-hole.net",
  actions: piHoleActions,
};
