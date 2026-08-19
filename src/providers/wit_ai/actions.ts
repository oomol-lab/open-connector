import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "wit_ai";

const textField = s.nonEmptyString("User text sent to Wit.ai for analysis.");
const topNField = s.integer("Maximum number of top candidates to request from Wit.ai.", { minimum: 1, maximum: 8 });
const offsetField = s.integer("Number of records to skip before collecting results.", { minimum: 0 });
const intentNameField = s.nonEmptyString("Intent name.");
const entityNameField = s.nonEmptyString("Entity name or ID.");
const traitNameField = s.nonEmptyString("Trait name or ID.");
const valueField = s.nonEmptyString("Canonical value.");
const stringList = (description: string) => s.stringArray(description, { minItems: 1 });
const emptyInput = s.actionInput({}, [], "No input is required.");
const queueMutationOutput = s.actionOutput({
  sent: s.boolean("Whether Wit.ai accepted the asynchronous request."),
  count: s.integer("Number of records reported as accepted."),
});
const intentOutput = s.object("A Wit.ai intent.", {
  id: s.string("Unique identifier of the intent."),
  name: s.string("Intent name."),
});
const entitySummaryOutput = s.object("A Wit.ai entity summary.", {
  id: s.string("Unique identifier of the entity."),
  name: s.string("Entity name."),
});
const traitSummaryOutput = s.object("A Wit.ai trait summary.", {
  id: s.string("Unique identifier of the trait."),
  name: s.string("Trait name."),
});
const entityKeyword = s.object("A keyword configured on an entity.", {
  keyword: s.nonEmptyString("Keyword value."),
  synonyms: s.stringArray("Alternative phrases for the keyword."),
});
const entityDetailOutput = s.looseObject("A Wit.ai entity including roles, lookups, and keywords.", {
  id: s.string("Unique identifier of the entity."),
  name: s.string("Entity name."),
  lookups: s.stringArray("Lookup strategies configured for the entity."),
  roles: s.stringArray("Roles configured for the entity."),
  keywords: s.array("Keywords and synonyms defined on the entity.", entityKeyword),
});
const traitDetailOutput = s.looseObject("A Wit.ai trait including configured values.", {
  id: s.string("Unique identifier of the trait."),
  name: s.string("Trait name."),
  values: s.array("Values configured for the trait.", s.unknownObject("A trait value.")),
});
const utteranceEntity = s.looseObject("An annotated entity in an utterance.", {
  entity: s.nonEmptyString("Entity name including role when applicable."),
  start: s.integer("Start index of the entity span.", { minimum: 0 }),
  end: s.integer("End index of the entity span.", { minimum: 0 }),
  body: s.string("Source text matched by the entity."),
  entities: s.array("Nested entities inside the composite entity.", s.unknownObject("A nested entity.")),
});
const utteranceTrait = s.object("An annotated trait in an utterance.", {
  trait: traitNameField,
  value: valueField,
});
const utteranceInput = s.object("One validated utterance to enqueue for training.", {
  text: textField,
  intent: intentNameField,
  entities: s.array("Annotated entities in the utterance.", utteranceEntity),
  traits: s.array("Annotated traits in the utterance.", utteranceTrait),
});

function input(properties: Record<string, JsonSchema>, required: string[], description: string): JsonSchema {
  return s.actionInput(properties, required, description);
}

export const witAiActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "analyze_message",
    description: "Analyze a text message and return the intents, entities, and traits inferred by Wit.ai.",
    inputSchema: input(
      {
        text: textField,
        topN: topNField,
        tag: s.nonEmptyString("Specific Wit.ai app version tag to query."),
        context: s.record("Context object used by Wit.ai for locale, timezone, and other hints.", true),
        dynamicEntities: s.record("Dynamic entities injected into the request for one-off disambiguation.", true),
      },
      ["text"],
      "Input parameters for analyzing a text message with Wit.ai.",
    ),
    outputSchema: s.actionOutput({
      text: s.string("Original text returned by Wit.ai."),
      messageId: s.nullableString("Optional message identifier returned by Wit.ai."),
      intents: s.array("Detected intents sorted by confidence.", s.unknownObject("A detected intent.")),
      entities: s.record("Detected entities keyed by entity name.", s.array(s.unknownObject("A detected entity."))),
      traits: s.record("Detected traits keyed by trait name.", s.array(s.unknownObject("A detected trait."))),
    }),
  }),
  defineProviderAction(service, {
    name: "detect_language",
    description: "Detect the most likely locales for a text message using Wit.ai language identification.",
    inputSchema: input({ text: textField, topN: topNField }, ["text"], "Input parameters for detecting locales."),
    outputSchema: s.actionOutput({
      detectedLocales: s.array("Detected locales returned by Wit.ai.", s.unknownObject("A detected locale.")),
    }),
  }),
  defineProviderAction(service, {
    name: "list_apps",
    description: "List the Wit.ai apps accessible by the current bearer token.",
    inputSchema: input(
      {
        limit: s.integer("Maximum number of apps to return.", { minimum: 1, maximum: 10000 }),
        offset: offsetField,
      },
      ["limit"],
      "Pagination parameters for listing Wit.ai apps.",
    ),
    outputSchema: s.actionOutput({
      apps: s.array("Apps accessible by the current bearer token.", s.unknownObject("A Wit.ai app summary.")),
    }),
  }),
  defineProviderAction(service, {
    name: "get_app",
    description: "Retrieve details and training status for a specific Wit.ai app.",
    inputSchema: input({ appId: s.nonEmptyString("Wit.ai app ID.") }, ["appId"], "Input for retrieving a Wit.ai app."),
    outputSchema: s.looseObject("A Wit.ai app detail.", {}),
  }),
  defineProviderAction(service, {
    name: "list_intents",
    description: "List all intents defined in the current Wit.ai app.",
    inputSchema: input(
      {
        limit: s.integer("Maximum number of intents to return.", { minimum: 1, maximum: 200 }),
        offset: offsetField,
      },
      [],
      "Pagination parameters for listing Wit.ai intents.",
    ),
    outputSchema: s.actionOutput({ intents: s.array("Intents defined in the app.", intentOutput) }),
  }),
  defineProviderAction(service, {
    name: "create_intent",
    description: "Create a new Wit.ai intent for labeling user messages.",
    inputSchema: input({ name: intentNameField }, ["name"], "Input for creating a new Wit.ai intent."),
    outputSchema: intentOutput,
  }),
  defineProviderAction(service, {
    name: "get_intent",
    description: "Retrieve a Wit.ai intent together with the entity bindings it uses.",
    inputSchema: input({ intentName: intentNameField }, ["intentName"], "Input for retrieving a Wit.ai intent."),
    outputSchema: s.looseObject("A Wit.ai intent with entity bindings.", {
      id: s.string("Unique identifier of the intent."),
      name: s.string("Intent name."),
      entities: s.array("Entities associated with the intent.", entitySummaryOutput),
    }),
  }),
  defineProviderAction(service, {
    name: "list_entities",
    description: "List all entities defined in the current Wit.ai app.",
    inputSchema: emptyInput,
    outputSchema: s.actionOutput({ entities: s.array("Entities defined in the app.", entitySummaryOutput) }),
  }),
  defineProviderAction(service, {
    name: "create_entity",
    description: "Create a new Wit.ai entity with optional lookups and keywords.",
    inputSchema: input(
      {
        name: entityNameField,
        roles: stringList("Roles to create for the entity. At least one role is required."),
        lookups: stringList("Lookup strategies enabled for the entity."),
        keywords: s.array("Initial keywords and synonyms for keyword-based entities.", entityKeyword),
      },
      ["name", "roles"],
      "Input for creating a new Wit.ai entity.",
    ),
    outputSchema: entityDetailOutput,
  }),
  defineProviderAction(service, {
    name: "get_entity",
    description: "Retrieve a Wit.ai entity including its roles, lookups, and keywords.",
    inputSchema: input({ entityName: entityNameField }, ["entityName"], "Input for retrieving a Wit.ai entity."),
    outputSchema: entityDetailOutput,
  }),
  defineProviderAction(service, {
    name: "update_entity",
    description: "Update a Wit.ai entity by sending the desired end-state definition for its schema and keywords.",
    inputSchema: input(
      {
        entityName: entityNameField,
        name: entityNameField,
        roles: stringList("Final list of roles for the entity. At least one role is required."),
        lookups: stringList("Lookup strategies enabled for the entity."),
        keywords: s.array("Final list of keywords and synonyms for the entity.", entityKeyword),
      },
      ["entityName", "name", "roles"],
      "Input for updating a Wit.ai entity.",
    ),
    outputSchema: entityDetailOutput,
  }),
  defineProviderAction(service, {
    name: "add_entity_keyword",
    description: "Add a keyword and optional synonyms to an existing Wit.ai entity.",
    inputSchema: input(
      {
        entityName: entityNameField,
        keyword: s.nonEmptyString("Keyword value."),
        synonyms: stringList("Synonyms for the new keyword."),
      },
      ["entityName", "keyword"],
      "Input for adding a keyword to a Wit.ai entity.",
    ),
    outputSchema: entityDetailOutput,
  }),
  defineProviderAction(service, {
    name: "add_keyword_synonym",
    description: "Add a synonym to a specific keyword on a Wit.ai entity.",
    inputSchema: input(
      {
        entityName: entityNameField,
        keyword: s.nonEmptyString("Keyword value."),
        synonym: s.nonEmptyString("Synonym value."),
      },
      ["entityName", "keyword", "synonym"],
      "Input for adding a synonym to a Wit.ai entity keyword.",
    ),
    outputSchema: queueMutationOutput,
  }),
  defineProviderAction(service, {
    name: "list_traits",
    description: "List all traits defined in the current Wit.ai app.",
    inputSchema: emptyInput,
    outputSchema: s.actionOutput({ traits: s.array("Traits defined in the app.", traitSummaryOutput) }),
  }),
  defineProviderAction(service, {
    name: "create_trait",
    description: "Create a new Wit.ai trait with one or more canonical values.",
    inputSchema: input(
      {
        name: traitNameField,
        values: s.array(
          "Trait values to create.",
          s.union([s.nonEmptyString("A trait value."), s.unknownObject("A trait value object.")]),
          { minItems: 1 },
        ),
        lookups: stringList("Lookup strategies configured for the trait."),
        mutuallyExclusive: s.boolean("Whether the trait should match at most one value per message."),
      },
      ["name", "values"],
      "Input for creating a new Wit.ai trait.",
    ),
    outputSchema: traitDetailOutput,
  }),
  defineProviderAction(service, {
    name: "get_trait",
    description: "Retrieve a Wit.ai trait together with its configured values.",
    inputSchema: input({ traitName: traitNameField }, ["traitName"], "Input for retrieving a Wit.ai trait."),
    outputSchema: traitDetailOutput,
  }),
  defineProviderAction(service, {
    name: "add_trait_value",
    description: "Add a canonical value to an existing Wit.ai trait.",
    inputSchema: input(
      { traitName: traitNameField, value: valueField },
      ["traitName", "value"],
      "Input for adding a Wit.ai trait value.",
    ),
    outputSchema: traitDetailOutput,
  }),
  defineProviderAction(service, {
    name: "list_utterances",
    description: "List validated utterances already stored in the current Wit.ai app.",
    inputSchema: input(
      {
        limit: s.integer("Maximum number of utterances to return.", { minimum: 1, maximum: 10000 }),
        offset: offsetField,
        intents: stringList("Optional list of intents used to filter returned utterances."),
        traits: stringList("Optional list of traits used to filter returned utterances."),
        entities: stringList("Optional list of entities used to filter returned utterances."),
      },
      ["limit"],
      "Input for listing validated Wit.ai utterances.",
    ),
    outputSchema: s.actionOutput({
      utterances: s.array("Validated utterances returned by Wit.ai.", s.unknownObject("A validated utterance.")),
    }),
  }),
  defineProviderAction(service, {
    name: "create_utterances",
    description: "Asynchronously enqueue validated utterances for training in Wit.ai.",
    inputSchema: input(
      {
        utterances: s.array("Utterances to enqueue for training.", utteranceInput, { minItems: 1 }),
      },
      ["utterances"],
      "Input for creating Wit.ai utterances.",
    ),
    outputSchema: queueMutationOutput,
  }),
  defineProviderAction(service, {
    name: "delete_utterances",
    description: "Asynchronously delete validated utterances from the current Wit.ai app.",
    inputSchema: input(
      {
        utterances: s.array(
          "Validated utterances to delete asynchronously.",
          s.object("One utterance to delete.", { text: textField }),
          { minItems: 1 },
        ),
      },
      ["utterances"],
      "Input for deleting Wit.ai utterances.",
    ),
    outputSchema: queueMutationOutput,
  }),
];
