import type { ProviderDefinition } from "../../core/types.ts";

import { actions } from "./actions.ts";

export const provider: ProviderDefinition = {
  service: "pdfcraft",
  displayName: "PDFCraft",
  description: "Convert scanned PDFs to Markdown or EPUB and translate PDF and EPUB documents.",
  categories: ["Documents", "AI"],
  homepageUrl: "https://pdfcraft.ai",
  iconUrl: "https://pdfcraft.ai/images/logo.png",
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "OOMOL API Key",
      placeholder: "OOMOL_API_KEY",
      description: "Use your OOMOL API key as a Bearer token for PDFCraft. Conversion uses your OOMOL credit balance.",
    },
  ],
  actions,
};
