import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "textrazor";
const rawObject = s.looseObject({}, { description: "A raw object returned by TextRazor." });
const noInput = s.object("No input parameters are required for this action.", {});

function action(
  name: string,
  description: string,
  inputSchema: JsonSchema,
  outputSchema: JsonSchema,
): ActionDefinition {
  return defineProviderAction(service, { name, description, inputSchema, outputSchema });
}

const analysisInput = s.looseObject(
  {
    text: s.nonEmptyString("The text to analyze."),
    extractors: s.stringArray("The TextRazor extractors to run."),
    cleanup_mode: s.stringEnum("The cleanup mode TextRazor should apply before analysis.", [
      "raw",
      "stripTags",
      "cleanHTML",
    ]),
    language_override: s.string("An ISO-639-2 language code used to force analysis language.", {
      minLength: 3,
      maxLength: 3,
    }),
    cleanup_use_metadata: s.boolean("Whether TextRazor may use document metadata during cleanup."),
    cleanup_return_cleaned: s.boolean("Whether TextRazor should return cleaned text."),
  },
  { description: "Input for a TextRazor analysis request." },
);

const analysisOutput = s.looseObject(
  {
    ok: s.boolean("Whether the analysis request succeeded."),
    time: s.number("The processing time in seconds reported by TextRazor."),
    response: rawObject,
  },
  { description: "The top-level TextRazor analysis response." },
);

export const textrazorActions: ActionDefinition[] = [
  action(
    "account_info",
    "Read TextRazor account quota and plan information.",
    noInput,
    s.looseObject(
      {
        plan: s.string("The current subscription plan identifier."),
        requestsUsedToday: s.integer("The number of requests already used today."),
        concurrentRequestLimit: s.integer("The maximum number of concurrent requests allowed."),
      },
      { description: "The TextRazor account summary." },
    ),
  ),
  action("analyze_content", "Analyze text with one or more TextRazor extractors.", analysisInput, analysisOutput),
  action(
    "extract_entities",
    "Extract entities from text with TextRazor.",
    s.looseObject(
      {
        text: s.nonEmptyString("The text to analyze."),
        entities_allow_overlap: s.boolean("Whether entity matches may overlap."),
        entities_filter_dbpedia_types: s.stringArray("DBpedia types to include."),
        entities_filter_freebase_types: s.stringArray("Freebase types to include."),
        entity_dictionaries: s.stringArray("Custom entity dictionary ids to use."),
      },
      { description: "Input for TextRazor entity extraction." },
    ),
    analysisOutput,
  ),
  action(
    "classify_text",
    "Classify text with TextRazor classifiers.",
    s.looseObject(
      {
        text: s.nonEmptyString("The text to classify."),
        classifiers: s.stringArray("The TextRazor classifiers to run.", { minItems: 1 }),
      },
      { description: "Input for TextRazor classification." },
    ),
    analysisOutput,
  ),
  action(
    "custom_classifier_manager",
    "Create, update, inspect, or delete a TextRazor custom classifier.",
    s.looseObject(
      {
        operation: s.stringEnum("The classifier manager operation.", [
          "create_update",
          "delete",
          "get_categories",
          "get_category",
          "delete_category",
        ]),
        classifier_id: s.nonEmptyString("The classifier identifier."),
      },
      { description: "Input payload for the custom classifier manager action." },
    ),
    rawObject,
  ),
  action(
    "dictionary_manager",
    "Create, inspect, update, or delete TextRazor custom entity dictionaries.",
    s.looseObject(
      {
        operation: s.stringEnum("The dictionary manager operation.", [
          "create",
          "list",
          "get",
          "delete",
          "add_entries",
          "get_entries",
          "delete_entries",
        ]),
        dictionary_id: s.nonEmptyString("The dictionary identifier."),
      },
      { description: "Input payload for the dictionary manager action." },
    ),
    rawObject,
  ),
];
