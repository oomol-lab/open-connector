import type { ProviderDefinition } from "../../core/types.ts";

import { wufooActions } from "./actions.ts";

export const provider: ProviderDefinition = {
  service: "wufoo",
  displayName: "Wufoo",
  description: "Read forms and entries or submit entries to Wufoo.",
  categories: ["Data", "Productivity"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Key",
      placeholder: "WUFOO_API_KEY",
      description:
        "Wufoo API key used as the HTTP Basic authentication username. In Form Manager, open More > API Information beside a form: https://app.wufoo.com/#/form-manager",
      extraFields: [
        {
          key: "subdomain",
          label: "Subdomain",
          inputType: "text",
          required: true,
          secret: false,
          placeholder: "your-account",
          description:
            "Your Wufoo account subdomain from https://<subdomain>.wufoo.com. Admins can find it in Account Manager: https://help.surveymonkey.com/en/wufoo/account/account-manager/",
        },
      ],
    },
  ],
  homepageUrl: "https://www.wufoo.com/",
  actions: wufooActions,
};
