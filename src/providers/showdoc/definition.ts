import type { ProviderDefinition } from "../../core/types.ts";

import { showdocActions } from "./actions.ts";

export const provider: ProviderDefinition = {
  service: "showdoc",
  displayName: "ShowDoc",
  description: "Project documentation, catalogs, and attachments",
  homepageUrl: "https://www.showdoc.com.cn/",
  categories: ["Documents", "Developer Tools"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Key",
      description:
        "Open your ShowDoc project settings and select Open API to copy api_key and its paired api_token. Guide: https://www.showdoc.com.cn/openapi",
      extraFields: [
        {
          key: "apiToken",
          label: "API Token",
          required: true,
          secret: true,
          inputType: "password",
          description:
            "Copy api_token from the same project's settings under Open API. Guide: https://www.showdoc.com.cn/openapi",
        },
      ],
    },
  ],
  actions: showdocActions,
};
