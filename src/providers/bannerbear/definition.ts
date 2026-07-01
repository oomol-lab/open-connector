import type { ProviderDefinition } from "../../core/types.ts";

import { bannerbearActions } from "./actions.ts";

const service = "bannerbear";

export const provider: ProviderDefinition = {
  service,
  displayName: "Bannerbear",
  categories: ["Design & Media", "Marketing"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Key",
      placeholder: "bb_live_...",
      description:
        "Bannerbear Project API Key or Full Access Master API Key sent as an Authorization Bearer token. Find Project API Keys in Project Settings or manage Master API Keys at https://app.bannerbear.com/account/api_keys",
      extraFields: [
        {
          key: "projectId",
          label: "Project UID",
          inputType: "text",
          required: false,
          secret: false,
          placeholder: "Y7qXEd1n46kZP8GAr3",
          description:
            "Optional Bannerbear project UID used when validating a Full Access Master API Key. Project API Keys are already scoped to one project and can leave this blank.",
        },
      ],
    },
  ],
  homepageUrl: "https://www.bannerbear.com/",
  actions: bannerbearActions,
};
