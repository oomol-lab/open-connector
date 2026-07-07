import type { ProviderDefinition } from "../../core/types.ts";

import { langSmithActions } from "./actions.ts";

const service = "langsmith";

export const provider: ProviderDefinition = {
  service,
  displayName: "LangSmith",
  categories: ["AI", "Developer Tools"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Key",
      placeholder: "LANGSMITH_API_KEY",
      description:
        "LangSmith API key sent with the X-Api-Key header. Create a PAT or service key from the LangSmith settings API Keys page: https://smith.langchain.com/settings.",
      extraFields: [
        {
          key: "region",
          label: "Region",
          inputType: "text",
          required: false,
          secret: false,
          placeholder: "us",
          description:
            "Optional LangSmith SaaS region. Use us for api.smith.langchain.com, eu for eu.api.smith.langchain.com, apac for apac.api.smith.langchain.com, or aws_us for aws.api.smith.langchain.com.",
        },
        {
          key: "workspaceId",
          label: "Workspace ID",
          inputType: "text",
          required: false,
          secret: false,
          placeholder: "00000000-0000-0000-0000-000000000000",
          description:
            "Optional LangSmith workspace ID sent with X-Tenant-Id when your API key can access more than one workspace. Find it in LangSmith settings under General: https://smith.langchain.com/settings.",
        },
      ],
    },
  ],
  homepageUrl: "https://www.langchain.com/langsmith",
  actions: langSmithActions,
};
