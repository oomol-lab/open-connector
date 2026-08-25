import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "tanium";

const graphqlVariableValueSchema = s.unknown("A JSON value passed as a GraphQL variable.");
const graphqlVariablesSchema = s.record("GraphQL variables keyed by variable name.", graphqlVariableValueSchema);
const graphqlErrorSchema = s.looseObject("A GraphQL error returned by Tanium Gateway.", {
  message: s.string("The GraphQL error message."),
  path: s.array(
    "The GraphQL response path where the error occurred.",
    s.anyOf("A GraphQL path segment.", [s.string("A string path segment."), s.number("A numeric path segment.")]),
  ),
  locations: s.array(
    "Source locations related to the GraphQL error.",
    s.looseObject("A GraphQL error source location.", {
      line: s.integer("The source line number."),
      column: s.integer("The source column number."),
    }),
  ),
  extensions: s.looseObject("Additional GraphQL error metadata."),
});

const graphqlResultSchema = s.object(
  "The Tanium Gateway GraphQL execution result.",
  {
    data: s.nullable(s.looseObject("The GraphQL data payload returned by Tanium Gateway.")),
    errors: s.array("GraphQL errors returned by Tanium Gateway.", graphqlErrorSchema),
    extensions: s.looseObject("GraphQL response extensions returned by Tanium Gateway."),
    message: s.string("A semicolon-separated summary of GraphQL error messages."),
  },
  { optional: ["data", "errors", "extensions", "message"] },
);

export const taniumActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "execute_graphql",
    description: "Execute a GraphQL document against the connected Tanium Gateway endpoint.",
    inputSchema: s.actionInput(
      {
        query: s.nonEmptyString("The GraphQL query or mutation document to execute."),
        variables: graphqlVariablesSchema,
        operationName: s.string("The GraphQL operation name to execute when the document has multiple operations."),
      },
      ["query"],
      "The Tanium Gateway GraphQL request payload.",
    ),
    outputSchema: graphqlResultSchema,
  }),
];
