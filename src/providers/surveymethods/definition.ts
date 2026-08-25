import type { ProviderDefinition } from "../../core/types.ts";

import { surveyMethodsActions } from "./actions.ts";

export const provider: ProviderDefinition = {
  service: "surveymethods",
  displayName: "SurveyMethods",
  categories: ["Productivity", "Marketing"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Key",
      placeholder: "YOUR_API_KEY",
      description: "SurveyMethods API key from My Account > API Key Management: https://app.surveymethods.com/.",
      extraFields: [
        {
          key: "loginId",
          label: "Login ID",
          inputType: "text",
          required: true,
          secret: false,
          placeholder: "user@example.com",
          description: "The SurveyMethods account email paired with the API key.",
        },
      ],
    },
  ],
  homepageUrl: "https://surveymethods.com/",
  actions: surveyMethodsActions,
};
