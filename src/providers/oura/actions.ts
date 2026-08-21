import type { ActionDefinition, JsonSchema } from "../../core/types.ts";
import type { OuraDocumentCollection } from "./collections.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";
import { ouraDocumentCollections } from "./collections.ts";

const service = "oura";

const documentSchema = s.looseObject("One Oura document. Fields differ per collection; `id` is always present.", {
  id: s.nonEmptyString("The Oura document identifier."),
});

/**
 * Time series collections return bare samples: Oura assigns them no document
 * id, and exposes no single-document endpoint one could be used on.
 */
const sampleSchema = s.unknownObject(
  "One Oura time series sample. Fields differ per collection, and samples carry no document identifier.",
);

const nextTokenSchema = s.nullableString(
  "Pagination token for the next page, or null when the last page has been returned.",
);

const fieldsSchema = s.stringArray(
  "Extra document fields to include in the response, in addition to the fields Oura always returns. Defaults to all fields.",
  { itemDescription: "One Oura document field name." },
);

const documentIdInputSchema = s.object(
  "The Oura document lookup input.",
  { documentId: s.nonEmptyString("The Oura document identifier.") },
  { required: ["documentId"] },
);

const personalInfoSchema = s.looseObject("The personal information stored on the authenticated Oura account.", {
  id: s.nonEmptyString("The Oura user identifier."),
  age: s.nullableInteger("The user age in years."),
  weight: s.nullableNumber("The user weight in kilograms."),
  height: s.nullableNumber("The user height in meters."),
  biological_sex: s.nullableString("The biological sex recorded on the Oura account."),
  email: s.nullableString("The email address of the Oura account. Requires the `email` scope."),
});

/**
 * Public Oura action catalog: one `list_*` action per user data collection,
 * one `get_*` action per collection that Oura serves by document ID, plus the
 * account personal information document.
 */
export const ouraActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_personal_info",
    description: "Get personal information for the authenticated Oura account.",
    requiredScopes: ["personal"],
    inputSchema: s.object("No input parameters are required for this action.", {}),
    outputSchema: s.object("The personal information response returned by Oura.", {
      personalInfo: personalInfoSchema,
    }),
  }),
  ...ouraDocumentCollections.flatMap(collectionActions),
];

function collectionActions(collection: OuraDocumentCollection): ActionDefinition[] {
  const actions: ActionDefinition[] = [
    defineProviderAction(service, {
      name: `list_${collection.name}`,
      description: describe(collection, `List ${collection.label} documents from Oura.`),
      requiredScopes: [collection.scope],
      inputSchema: listInputSchema(collection),
      outputSchema: s.object(`The paginated ${collection.label} list returned by Oura.`, {
        documents: s.array(
          `The ${collection.label} documents returned for this page.`,
          collection.hasDocumentEndpoint ? documentSchema : sampleSchema,
        ),
        nextToken: nextTokenSchema,
      }),
    }),
  ];

  if (collection.hasDocumentEndpoint) {
    actions.push(
      defineProviderAction(service, {
        name: `get_${collection.name}`,
        description: describe(collection, `Get one ${collection.label} document from Oura by document ID.`),
        requiredScopes: [collection.scope],
        inputSchema: documentIdInputSchema,
        outputSchema: s.object(`The single ${collection.label} document returned by Oura.`, {
          document: documentSchema,
        }),
      }),
    );
  }

  return actions;
}

function listInputSchema(collection: OuraDocumentCollection): JsonSchema {
  const properties: Record<string, JsonSchema> = {};

  if (collection.window === "date") {
    properties.startDate = s.date(`The earliest day to return ${collection.label} documents for, as YYYY-MM-DD.`);
    properties.endDate = s.date(`The latest day to return ${collection.label} documents for, as YYYY-MM-DD.`);
  }
  if (collection.window === "datetime") {
    properties.startDatetime = s.dateTime(
      `The earliest ISO 8601 timestamp to return ${collection.label} documents for.`,
    );
    properties.endDatetime = s.dateTime(`The latest ISO 8601 timestamp to return ${collection.label} documents for.`);
  }
  if (collection.supportsLatest) {
    properties.latest = s.boolean(`Return only the most recent ${collection.label} instead of a full page.`);
  }

  properties.nextToken = s.nonEmptyString("The pagination token returned by a previous call as `nextToken`.");
  properties.fields = fieldsSchema;

  return s.object(`The ${collection.label} list query.`, properties);
}

function describe(collection: OuraDocumentCollection, sentence: string): string {
  return collection.note ? `${sentence} ${collection.note}` : sentence;
}
