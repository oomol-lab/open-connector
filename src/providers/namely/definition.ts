import type { ProviderDefinition } from "../../core/types.ts";

import { namelyActions } from "./actions.ts";

const service = "namely";

export const provider: ProviderDefinition = {
  service,
  displayName: "Namely",
  categories: ["Productivity", "Data"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "Personal Access Token",
      placeholder: "NAMELY_PAT",
      description:
        "Namely personal access token sent with the Authorization Bearer header. See the official authentication docs: https://developers.namely.com/docs/namely-api/ZG9jOjE1NTkwMDU5-authentication.",
      extraFields: [
        {
          key: "company",
          label: "Company Subdomain",
          inputType: "text",
          required: true,
          secret: false,
          placeholder: "acme",
          description:
            "Namely company subdomain used to build https://<company>.namely.com/api/v1 requests. Use only the subdomain, not the full URL.",
        },
      ],
    },
  ],
  homepageUrl: "https://www.namely.com",
  actions: namelyActions,
};
