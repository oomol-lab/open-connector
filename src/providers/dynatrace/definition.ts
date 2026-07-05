import type { ProviderDefinition } from "../../core/types.ts";

import { dynatraceActions } from "./actions.ts";

const service = "dynatrace";

/**
 * Dynatrace provider backed by tenant-specific Environment API endpoints.
 */
export const provider: ProviderDefinition = {
  service,
  displayName: "Dynatrace",
  categories: ["Developer Tools", "Data"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Token",
      placeholder: "DYNATRACE_API_TOKEN",
      description:
        "Dynatrace API token sent with the Authorization: Api-Token header. Create or view access tokens in Dynatrace token management: https://docs.dynatrace.com/docs/manage/identity-access-management/access-tokens-and-oauth-clients/access-tokens.",
      extraFields: [
        {
          key: "environmentUrl",
          label: "Environment URL",
          inputType: "text",
          required: true,
          secret: false,
          placeholder: "https://abc12345.live.dynatrace.com",
          description:
            "The HTTPS Dynatrace environment URL for API requests, such as https://abc12345.live.dynatrace.com. You can paste the root environment URL or a page URL from that environment.",
        },
      ],
    },
  ],
  homepageUrl: "https://www.dynatrace.com",
  actions: dynatraceActions,
};
