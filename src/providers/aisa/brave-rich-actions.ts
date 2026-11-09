import type { ActionDefinition, JsonSchema } from "../../core/types.ts";
import type { AisaActionRoute } from "./routes.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";
import { searchResearchActions, searchResearchRoutes } from "./search-research-actions.ts";

const webSearch = searchResearchActions.find((action) => action.name === "search_brave_web")!;
const webProperties = webSearch.inputSchema.properties as Record<string, JsonSchema>;

const richSearchProperties = Object.fromEntries(
  Object.entries(webProperties).filter(([name]) => name !== "enableRichCallback"),
);

export const braveRichActions: ActionDefinition[] = [
  defineProviderAction("aisa", {
    name: "get_brave_rich",
    operationType: "read",
    description:
      "Read real-time Brave rich results using a callback key from a previous web search with enableRichCallback enabled.",
    requiredScopes: [],
    inputSchema: s.object(
      "A callback key returned by Brave web search.",
      {
        callbackKey: s.string("The rich.hint.callback_key returned by Brave web search.", {
          minLength: 1,
        }),
        apiVersion: webProperties.apiVersion!,
        cacheControl: webProperties.cacheControl!,
      },
      { optional: ["apiVersion", "cacheControl"] },
    ),
    outputSchema: s.object(
      "Brave rich results, including additional upstream fields.",
      {
        type: s.string("The response type, normally rich."),
        results: s.array(
          "Rich results such as weather, calculations, sports, or currency data.",
          s.looseObject("One rich result."),
        ),
        response_callback_info: s.nullable(s.looseObject("Callback status and metadata.")),
      },
      { optional: ["type", "results", "response_callback_info"], additionalProperties: true },
    ),
  }),
  defineProviderAction("aisa", {
    name: "search_brave_rich",
    operationType: "read",
    description:
      "Search Brave and retrieve available real-time rich results in one call. Enables rich callbacks automatically. If no rich result is available, returns the web search with rich=null. If the follow-up fails, preserves the search and returns partial=true with an error; retry get_brave_rich with the returned callback instead of repeating the search. Each upstream request may incur usage.",
    requiredScopes: [],
    inputSchema: {
      ...webSearch.inputSchema,
      description: "A Brave web search whose rich results are fetched automatically when available.",
      properties: richSearchProperties,
    },
    outputSchema: s.object(
      "The completed web search and optional rich-result follow-up.",
      {
        search: {
          description: "The original web-search response, including its rich callback when available.",
        },
        rich: {
          description: "The rich-result response, or null if absent or if the follow-up failed.",
        },
        partial: s.boolean("Whether the web search succeeded but the rich-result follow-up failed."),
        error: s.anyOf("Follow-up error details, or null when no error occurred.", [
          s.object(
            "The rich-result follow-up failure.",
            {
              code: s.string("The connector error code."),
              message: s.string("The failure message; the web-search response remains available."),
              status: s.integer("The HTTP status associated with the failure."),
            },
            { optional: [] },
          ),
          s.literal(null, { description: "No follow-up failure." }),
        ]),
      },
      { optional: [] },
    ),
  }),
];

export const braveRichRoutes: Record<string, AisaActionRoute> = {
  get_brave_rich: {
    path: "/apis/v1/brave/web/rich",
    query: { callbackKey: "callback_key" },
    headers: { apiVersion: "api-version", cacheControl: "cache-control" },
  },
  search_brave_rich: searchResearchRoutes.search_brave_web!,
};
