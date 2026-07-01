import type { ProviderDefinition } from "../../core/types.ts";

import { grafanaActions } from "./actions.ts";

const service = "grafana";

export const provider: ProviderDefinition = {
  service,
  displayName: "Grafana",
  categories: ["Data & Analytics", "Developer Tools"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "Service Account Token",
      placeholder: "GRAFANA_SERVICE_ACCOUNT_TOKEN",
      description:
        "Grafana service account token sent as a Bearer token. Create one in Administration > Users and access > Service Accounts: https://grafana.com/docs/grafana/latest/administration/service-accounts/",
      extraFields: [
        {
          key: "baseUrl",
          label: "Grafana Base URL",
          inputType: "text",
          required: true,
          secret: false,
          placeholder: "https://your-stack.grafana.net",
          description:
            "Base URL of your Grafana instance, such as https://your-stack.grafana.net or a self-hosted Grafana URL.",
        },
      ],
    },
  ],
  homepageUrl: "https://grafana.com",
  actions: grafanaActions,
};
