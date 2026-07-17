import type { ProviderDefinition } from "../../core/types.ts";

import { scopusActions } from "./actions.ts";

const service = "scopus";

export const provider: ProviderDefinition = {
  service,
  displayName: "Scopus",
  description: "Search Scopus documents, authors, affiliations, and serial sources through the Elsevier APIs.",
  categories: ["Data"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "Elsevier API Key",
      placeholder: "ELSEVIER_API_KEY",
      description:
        "Elsevier API key sent in the X-ELS-APIKey header. Create or manage a key at https://dev.elsevier.com/apikey/manage and review the official API policies at https://dev.elsevier.com/policy.html",
      extraFields: [
        {
          key: "institutionToken",
          label: "Institutional Token",
          inputType: "password",
          required: false,
          secret: true,
          placeholder: "ELSEVIER_INSTITUTION_TOKEN",
          description:
            "Optional Elsevier Institutional Token sent in X-ELS-Insttoken to establish subscription entitlements when institutional IP authentication is unavailable. Request access through Elsevier API Support: https://dev.elsevier.com/support.html",
        },
      ],
    },
  ],
  homepageUrl: "https://www.scopus.com/",
  actions: scopusActions,
};
