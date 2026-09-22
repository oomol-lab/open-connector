import type { ProviderDefinition } from "../../core/types.ts";

import { pdfVectorActions } from "./actions.ts";

export const provider: ProviderDefinition = {
  service: "pdf_vector",
  displayName: "PDF Vector",
  description: "Parse, question, and extract structured data from documents available at public URLs.",
  categories: ["Documents", "Productivity", "AI"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Key",
      placeholder: "PDFVECTOR_API_KEY",
      description:
        "PDF Vector API key sent as a Bearer token. Create an account and manage your API key in the dashboard at https://app.pdfvector.com.",
      extraFields: [],
    },
  ],
  homepageUrl: "https://www.pdfvector.com",
  actions: pdfVectorActions,
};
