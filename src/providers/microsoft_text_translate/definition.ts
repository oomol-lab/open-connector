import type { ProviderDefinition } from "../../core/types.ts";

import { microsoftTextTranslateActions } from "./actions.ts";

const service = "microsoft_text_translate";

export const provider: ProviderDefinition = {
  service,
  displayName: "Microsoft Text Translate",
  description: "Translate, detect, transliterate, and inspect text with Azure AI Translator.",
  categories: ["AI", "Productivity"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "Translator Key",
      placeholder: "AZURE_TRANSLATOR_KEY",
      description:
        "Azure Translator resource key sent in the Ocp-Apim-Subscription-Key header. Create a Translator resource, then copy a key from its Keys and Endpoint page: https://learn.microsoft.com/en-us/azure/ai-services/translator/text-translation/quickstart/rest-api.",
      extraFields: [
        {
          key: "region",
          label: "Resource Region",
          inputType: "text",
          required: false,
          secret: false,
          placeholder: "eastus",
          description:
            "Optional Azure resource region sent in Ocp-Apim-Subscription-Region. It is required for regional and multi-service resources and optional for a global single-service Translator resource.",
        },
      ],
    },
  ],
  homepageUrl: "https://azure.microsoft.com/en-us/products/ai-services/ai-translator",
  actions: microsoftTextTranslateActions,
};
