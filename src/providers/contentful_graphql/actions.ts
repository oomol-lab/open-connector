import type { ProviderActionDefinition } from "../../core/provider-definition.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "contentful_graphql";

const graphQLVariablesSchema = s.looseObject("GraphQL variables keyed by variable name and encoded as JSON values.");
const graphQLErrorLocationSchema = s.looseObject("One GraphQL error location.", {
  line: s.integer("The one-based source line for the GraphQL error."),
  column: s.integer("The one-based source column for the GraphQL error."),
});
const graphQLErrorSchema = s.looseObject("One GraphQL error returned by Contentful.", {
  message: s.string("The GraphQL error message."),
  locations: s.array("Source locations associated with the GraphQL error.", graphQLErrorLocationSchema),
  path: s.array("GraphQL response path entries associated with the error.", s.unknown("One GraphQL path segment.")),
  extensions: s.looseObject("Provider-specific GraphQL error extensions."),
});

export type ContentfulGraphqlActionName = "execute_query";

export const contentfulGraphqlActions: Array<ProviderActionDefinition<ContentfulGraphqlActionName>> = [
  defineProviderAction(service, {
    name: "execute_query",
    description: "Execute a Contentful GraphQL Content API query against a space and environment.",
    requiredScopes: [],
    inputSchema: s.object(
      "The input payload for executing a Contentful GraphQL query.",
      {
        spaceId: s.nonEmptyString(
          "Contentful space identifier. Defaults to the space configured on the connection when omitted.",
        ),
        environmentId: s.nonEmptyString(
          "Contentful environment identifier. Defaults to the environment configured on the connection when omitted.",
        ),
        region: s.stringEnum("Contentful GraphQL API region.", ["global", "eu"]),
        query: s.nonEmptyString("The GraphQL query document to execute."),
        variables: graphQLVariablesSchema,
        operationName: s.nonEmptyString(
          "The GraphQL operation name to execute when the document defines multiple operations.",
        ),
      },
      {
        required: ["query"],
        optional: ["spaceId", "environmentId", "region", "variables", "operationName"],
      },
    ),
    outputSchema: s.object(
      "The normalized Contentful GraphQL response.",
      {
        data: s.nullable(
          s.looseObject("The GraphQL data object returned by Contentful, or null when execution failed."),
        ),
        errors: s.array("GraphQL errors returned by Contentful.", graphQLErrorSchema),
        extensions: s.looseObject("GraphQL response extensions returned by Contentful."),
        requestId: s.string("The Contentful request identifier response header."),
        queryCost: s.integer("The Contentful GraphQL query cost response header."),
        rateLimitSecondLimit: s.integer("The per-second Contentful rate limit response header."),
        rateLimitReset: s.integer("Seconds until the Contentful rate limit resets."),
      },
      {
        optional: ["data", "errors", "extensions", "requestId", "queryCost", "rateLimitSecondLimit", "rateLimitReset"],
      },
    ),
  }),
];
