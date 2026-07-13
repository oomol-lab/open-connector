import type { ProviderDefinition } from "../../core/types.ts";

import { fivetranActions } from "./actions.ts";

const service = "fivetran";

export const provider: ProviderDefinition = {
  service,
  displayName: "Fivetran",
  description: "Query Fivetran transformation projects, external log services, and hybrid deployment agents.",
  categories: ["Data", "Developer Tools"],
  authTypes: ["custom_credential"],
  auth: [
    {
      type: "custom_credential",
      fields: [
        {
          key: "apiKey",
          label: "API Key",
          inputType: "password",
          required: true,
          secret: true,
          placeholder: "FIVETRAN_API_KEY",
          description:
            "Scoped or System API key created in Fivetran. Fivetran authenticates REST API requests with an API key and API secret using HTTP Basic authentication: https://fivetran.com/docs/rest-api/getting-started.",
        },
        {
          key: "apiSecret",
          label: "API Secret",
          inputType: "password",
          required: true,
          secret: true,
          placeholder: "FIVETRAN_API_SECRET",
          description:
            "Secret paired with the Fivetran Scoped or System API key. Store it securely because Fivetran only displays it when it is generated.",
        },
      ],
    },
  ],
  homepageUrl: "https://fivetran.com",
  actions: fivetranActions,
};
