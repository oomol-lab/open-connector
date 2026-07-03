import type { ProviderDefinition } from "../../core/types.ts";

import { benchmarkEmailActions } from "./actions.ts";

const service = "benchmark_email";

export const provider: ProviderDefinition = {
  service,
  displayName: "Benchmark Email",
  categories: ["Marketing", "Communication"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Token",
      placeholder: "BENCHMARK_EMAIL_API_TOKEN",
      description:
        "Benchmark Email API token used in XMLAPI query parameters (token/method/output=json). Create or view it from your Benchmark Email developer settings and API guide: https://www.benchmarkemail.com/features/api/.",
      extraFields: [
        {
          key: "baseUrl",
          label: "API Base URL",
          inputType: "text",
          required: true,
          secret: false,
          placeholder: "https://api.benchmarkemail.com/1.0",
          description:
            "The Benchmark Email API base URL for your account region. Use the host documented in the Benchmark API guide or your account's developer settings: https://www.benchmarkemail.com/download/Benchmark-API-Getting-Started-Guide.pdf.",
        },
      ],
    },
  ],
  homepageUrl: "https://www.benchmarkemail.com",
  actions: benchmarkEmailActions,
};
