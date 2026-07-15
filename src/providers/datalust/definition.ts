import type { ProviderDefinition } from "../../core/types.ts";

import { datalustActions } from "./actions.ts";

const service = "datalust";

export const provider: ProviderDefinition = {
  service,
  displayName: "Datalust Seq",
  description: "Search, query, ingest, and manage structured log data in a Datalust Seq instance.",
  categories: ["Data", "Developer Tools"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "Seq API Key",
      placeholder: "SEQ_API_KEY",
      description:
        "Seq API key sent with the X-Seq-ApiKey header. The connection validator requires Read permission; add Ingest for event ingestion, Write for signals and saved queries, and Project when modifying protected entities. Create or copy a key from Data > Ingestion in your Seq instance: https://docs.datalust.co/docs/api-keys",
      extraFields: [
        {
          key: "baseUrl",
          label: "Seq URL",
          inputType: "text",
          required: true,
          secret: false,
          placeholder: "https://seq.example.com",
          description:
            "The HTTPS root URL of your Seq instance. Public addresses work by default; private-network targets require the self-hosted runtime to enable OOMOL_CONNECT_ALLOW_PRIVATE_NETWORK. Loopback, reserved, and cloud-metadata targets remain blocked.",
        },
      ],
    },
  ],
  homepageUrl: "https://datalust.co/seq",
  actions: datalustActions,
};
