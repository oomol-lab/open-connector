import type { ProviderDefinition } from "../../core/types.ts";

import { pubmedActions } from "./actions.ts";

const service = "pubmed";

/**
 * PubMed provider backed by public NCBI literature APIs.
 */
export const provider: ProviderDefinition = {
  service,
  displayName: "PubMed",
  description:
    "Search, retrieve, match, and trace biomedical literature through official NCBI APIs. NCBI disclaimer and copyright information: https://www.ncbi.nlm.nih.gov/home/about/policies/",
  categories: ["Data"],
  authTypes: ["no_auth", "api_key"],
  auth: [
    { type: "no_auth" },
    {
      type: "api_key",
      label: "NCBI API Key",
      placeholder: "NCBI_API_KEY",
      description:
        "Optional NCBI API key passed as the api_key query parameter. Create one from your NCBI account settings to raise the default E-utilities rate limit from 3 to 10 requests per second.",
    },
  ],
  homepageUrl: "https://pubmed.ncbi.nlm.nih.gov/",
  actions: pubmedActions,
};
