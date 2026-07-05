import type { ProviderDefinition } from "../../core/types.ts";

import { contentfulGraphqlActions } from "./actions.ts";

const service = "contentful_graphql";

export const provider: ProviderDefinition = {
  service,
  displayName: "Contentful GraphQL",
  categories: ["Developer Tools", "Productivity"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "Content API Token",
      placeholder: "CONTENTFUL_DELIVERY_OR_PREVIEW_TOKEN",
      description:
        "Contentful GraphQL Content API access token sent with the Authorization Bearer header. Create or copy delivery and preview tokens from Space settings > API keys in the Contentful web app: https://app.contentful.com/spaces",
      extraFields: [
        {
          key: "spaceId",
          label: "Space ID",
          inputType: "text",
          required: true,
          secret: false,
          placeholder: "your_space_id",
          description:
            "Contentful space ID used in GraphQL endpoint paths. Copy it from the Contentful web app space settings or API keys page: https://app.contentful.com/spaces",
        },
        {
          key: "environmentId",
          label: "Environment ID",
          inputType: "text",
          required: false,
          secret: false,
          placeholder: "master",
          description:
            "Contentful environment ID used in GraphQL endpoint paths. Use master for the default environment.",
        },
        {
          key: "region",
          label: "Region",
          inputType: "text",
          required: false,
          secret: false,
          placeholder: "global",
          description:
            "Contentful GraphQL API region. Use global for graphql.contentful.com or eu for EU data residency on graphql.eu.contentful.com.",
        },
      ],
    },
  ],
  homepageUrl: "https://www.contentful.com",
  actions: contentfulGraphqlActions,
};
