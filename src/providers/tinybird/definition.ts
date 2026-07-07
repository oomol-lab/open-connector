import type { ProviderDefinition } from "../../core/types.ts";

import { tinybirdActions } from "./actions.ts";
import { tinybirdDefaultApiBaseUrl } from "./constants.ts";

const service = "tinybird";

export const provider: ProviderDefinition = {
  service,
  displayName: "Tinybird",
  categories: ["Data", "Developer Tools"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "Token",
      placeholder: "TINYBIRD_TOKEN",
      description:
        "Tinybird token sent as an Authorization Bearer token. Create or copy Static Tokens in your Tinybird workspace, or use the token shown by `tb auth`: https://www.tinybird.co/docs/forward/core-concepts/tokens.",
      extraFields: [
        {
          key: "apiBaseUrl",
          label: "API Base URL",
          inputType: "text",
          required: false,
          secret: false,
          placeholder: tinybirdDefaultApiBaseUrl,
          description:
            "Optional Tinybird region API base URL for your workspace. Use one of the official region hosts listed in the API overview: https://www.tinybird.co/docs/api-reference#regions-and-endpoints.",
        },
      ],
    },
  ],
  homepageUrl: "https://www.tinybird.co",
  actions: tinybirdActions,
};
