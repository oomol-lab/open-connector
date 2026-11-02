import type { ProviderDefinition } from "../../core/types.ts";

import { dorisActions } from "./actions.ts";

export const provider: ProviderDefinition = {
  service: "doris",
  displayName: "Apache Doris",
  categories: ["Data", "Developer Tools"],
  authTypes: ["custom_credential"],
  auth: [
    {
      type: "custom_credential",
      fields: [
        {
          key: "baseUrl",
          label: "FE HTTP URL",
          inputType: "text",
          required: true,
          secret: false,
          placeholder: "https://doris.example.com:8030",
          description:
            "The Apache Doris 2.1+ frontend HTTP endpoint. Private instances require OOMOL_CONNECT_ALLOW_PRIVATE_NETWORK on a runtime that can reach the instance.",
        },
        {
          key: "username",
          label: "Username",
          inputType: "text",
          required: true,
          secret: false,
          placeholder: "oc_reader",
          description:
            "A dedicated Doris user with only SELECT_PRIV on the databases to query. Do not use an administrator account.",
        },
        {
          key: "password",
          label: "Password",
          inputType: "password",
          required: true,
          secret: true,
          description:
            "The Doris user's password, sent using HTTP Basic authentication. Use HTTPS when the endpoint is exposed publicly.",
        },
        {
          key: "defaultDatabase",
          label: "Default Database",
          inputType: "text",
          required: false,
          secret: false,
          placeholder: "analytics",
          description:
            "The database used when an action omits database. Query execution and credential validation use information_schema when this is unset; table actions require a database.",
        },
      ],
      testAction: { actionName: "execute_query", input: { query: "SELECT 1 AS ok" } },
    },
  ],
  homepageUrl: "https://doris.apache.org",
  actions: dorisActions,
};
