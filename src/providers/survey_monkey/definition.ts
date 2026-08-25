import type { ProviderDefinition } from "../../core/types.ts";

import { surveyMonkeyActions } from "./actions.ts";

export const provider: ProviderDefinition = {
  service: "survey_monkey",
  displayName: "SurveyMonkey",
  categories: ["Productivity", "Data"],
  authTypes: ["oauth2", "api_key"],
  auth: [
    {
      type: "oauth2",
      authorizationUrl: "https://api.surveymonkey.com/oauth/authorize",
      tokenUrl: "https://api.surveymonkey.com/oauth/token",
      scopes: [
        "users_read",
        "surveys_read",
        "surveys_write",
        "responses_read",
        "responses_read_detail",
        "collectors_read",
        "collectors_write",
        "contacts_read",
        "contacts_write",
      ],
      tokenEndpointAuthMethod: "client_secret_post",
    },
    {
      type: "api_key",
      label: "Access Token",
      placeholder: "SurveyMonkey access token",
      description: "A SurveyMonkey access token used as a Bearer token.",
    },
  ],
  homepageUrl: "https://www.surveymonkey.com",
  actions: surveyMonkeyActions,
};
