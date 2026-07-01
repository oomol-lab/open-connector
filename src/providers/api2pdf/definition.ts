import type { ProviderDefinition } from "../../core/types.ts";

import { api2pdfActions } from "./actions.ts";

const service = "api2pdf";

export const provider: ProviderDefinition = {
  service,
  displayName: "API2PDF",
  categories: ["Productivity", "Developer Tools"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Key",
      placeholder: "API2PDF_API_KEY",
      description:
        "API2PDF API key sent with the Authorization header. Sign in to the API2PDF portal to get your key: https://portal.api2pdf.com/.",
    },
  ],
  homepageUrl: "https://www.api2pdf.com",
  actions: api2pdfActions,
};
