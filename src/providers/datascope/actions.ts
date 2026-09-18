import type { ProviderActionDefinition } from "../../core/provider-definition.ts";
import type { JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "datascope";

const positiveInteger = (description: string): JsonSchema => s.positiveInteger(description);
const optionalText = (description: string): JsonSchema => s.nonEmptyString(description);
const timestamp = (description: string): JsonSchema => s.nonEmptyString(description);
const integerOrString = (description: string): JsonSchema =>
  s.union([s.integer({ description }), s.string({ description })], { description });

const dynamicAnswerValuesSchema = s.record(
  "The dynamic answer values keyed by question label or field name.",
  s.unknown("The raw answer value returned by DataScope."),
);

const datascopeAnswerSchema = s.object(
  {
    formId: positiveInteger("The DataScope form identifier."),
    formAnswerId: positiveInteger("The unique identifier of the submitted answer."),
    formCode: optionalText("The public code of the DataScope form."),
    formName: optionalText("The form name returned by DataScope."),
    formState: optionalText("The workflow state of the submitted answer."),
    userName: optionalText("The display name of the user who submitted the answer."),
    userIdentifier: optionalText("The unique user identifier returned by DataScope, such as an email address."),
    createdAt: timestamp("The submission timestamp returned by DataScope."),
    latitude: s.number("The latitude captured for the answer when available."),
    longitude: s.number("The longitude captured for the answer when available."),
    answers: dynamicAnswerValuesSchema,
  },
  {
    required: ["formId", "formAnswerId", "answers"],
    description: "One normalized DataScope answer summary.",
  },
);

const datascopeMetadataQuestionSchema = s.object(
  {
    formId: positiveInteger("The DataScope form identifier that owns this answer field."),
    formAnswerId: positiveInteger("The answer identifier that owns this answer field."),
    formCode: optionalText("The public code of the DataScope form."),
    formState: optionalText("The workflow state of the answer."),
    questionId: positiveInteger("The unique identifier of the form question."),
    questionName: optionalText("The visible question label returned by DataScope."),
    name: optionalText("The internal question name returned by DataScope."),
    questionValue: s.unknown("The raw answer value returned for this question."),
    questionType: optionalText("The question type returned by DataScope."),
    subformIndex: positiveInteger("The 1-based subform item index when present."),
    metadataType: optionalText("The metadata list type referenced by this question."),
    metadataId: positiveInteger("The metadata element identifier referenced by this question."),
  },
  {
    optional: [
      "formId",
      "formAnswerId",
      "formCode",
      "formState",
      "questionId",
      "questionName",
      "name",
      "questionType",
      "subformIndex",
      "metadataType",
      "metadataId",
    ],
    description: "One normalized answer item from the metadata-rich DataScope answers endpoint.",
  },
);

const datascopeAnswerWithMetadataSchema = s.object(
  {
    formId: positiveInteger("The DataScope form identifier."),
    formAnswerId: positiveInteger("The unique identifier of the submitted answer."),
    formCode: optionalText("The public code of the DataScope form."),
    formName: optionalText("The form name returned by DataScope."),
    formState: optionalText("The workflow state of the submitted answer."),
    userName: optionalText("The display name of the user who submitted the answer."),
    userIdentifier: optionalText("The unique user identifier returned by DataScope, such as an email address."),
    createdAt: timestamp("The submission timestamp returned by DataScope."),
    updatedAt: timestamp("The last-updated timestamp returned by DataScope."),
    latitude: s.number("The latitude captured for the answer when available."),
    longitude: s.number("The longitude captured for the answer when available."),
    finished: s.boolean("Whether DataScope marks the answer as finished."),
    assignId: integerOrString("The assignment identifier attached to the answer when available."),
    assignInternalId: integerOrString("The internal assignment identifier attached to the answer when available."),
    assignLocationName: optionalText("The assignment location name attached to the answer when available."),
    assignLocationDescription: optionalText(
      "The assignment location description attached to the answer when available.",
    ),
    assignLocationCode: optionalText("The assignment location code attached to the answer when available."),
    questions: s.array("The normalized question items returned for this answer.", datascopeMetadataQuestionSchema),
  },
  {
    required: ["formId", "formAnswerId", "questions"],
    description: "One normalized DataScope answer with per-question metadata.",
  },
);

const datascopeLocationSchema = s.object(
  {
    id: positiveInteger("The unique identifier of the DataScope location."),
    code: optionalText("The location code returned by DataScope."),
    name: s.nonEmptyString("The location name returned by DataScope."),
    description: optionalText("The location description returned by DataScope."),
    address: optionalText("The location address returned by DataScope."),
    city: optionalText("The city returned by DataScope."),
    country: optionalText("The country returned by DataScope."),
    region: optionalText("The region returned by DataScope."),
    latitude: s.number("The latitude returned by DataScope."),
    longitude: s.number("The longitude returned by DataScope."),
    phone: optionalText("The phone number returned by DataScope."),
    email: optionalText("The contact email returned by DataScope."),
    companyCode: optionalText("The company code returned by DataScope."),
    companyName: optionalText("The company name returned by DataScope."),
  },
  { required: ["id", "name"], description: "One normalized DataScope location." },
);

const datascopeListElementSchema = s.object(
  {
    id: positiveInteger("The unique identifier of the metadata list element."),
    metadataType: optionalText("The metadata list type that owns this element."),
    code: optionalText("The list element code returned by DataScope."),
    name: s.nonEmptyString("The list element name returned by DataScope."),
    description: optionalText("The list element description returned by DataScope."),
    attribute1: optionalText("The first custom attribute returned by DataScope."),
    attribute2: optionalText("The second custom attribute returned by DataScope."),
    listId: positiveInteger("The parent list identifier returned by DataScope."),
    accountId: positiveInteger("The account identifier returned by DataScope."),
    createdAt: timestamp("The creation timestamp returned by DataScope."),
    updatedAt: timestamp("The last-updated timestamp returned by DataScope."),
  },
  { required: ["id", "name"], description: "One normalized DataScope metadata list element." },
);

const answersFilterSchemaShape = {
  formId: positiveInteger("The DataScope form identifier to filter by."),
  userId: positiveInteger("The DataScope user identifier to filter by."),
  locationId: positiveInteger("The DataScope location identifier to filter by."),
  startAt: optionalText("The inclusive start timestamp filter sent to DataScope."),
  endAt: optionalText("The inclusive end timestamp filter sent to DataScope."),
};

const locationWriteFields = {
  code: optionalText("The location code to store in DataScope."),
  name: optionalText("The location name to store in DataScope."),
  description: optionalText("The location description to store in DataScope."),
  address: optionalText("The location address to store in DataScope."),
  city: optionalText("The city to store in DataScope."),
  country: optionalText("The country to store in DataScope."),
  region: optionalText("The region to store in DataScope."),
  latitude: s.number("The latitude to store in DataScope."),
  longitude: s.number("The longitude to store in DataScope."),
  phone: optionalText("The phone number to store in DataScope."),
  email: optionalText("The contact email to store in DataScope."),
  companyCode: optionalText("The company code to store in DataScope."),
  companyName: optionalText("The company name to store in DataScope."),
};

const listElementWriteFields = {
  code: optionalText("The code to store on the metadata list element."),
  name: optionalText("The display name to store on the metadata list element."),
  description: optionalText("The description to store on the metadata list element."),
  attribute1: optionalText("The first custom attribute to store on the element."),
  attribute2: optionalText("The second custom attribute to store on the element."),
};

const noInputSchema = s.object({}, { description: "No input parameters are required." });
const answersOptional = ["formId", "userId", "locationId", "startAt", "endAt"];
const locationOptional = Object.keys(locationWriteFields);
const listElementOptional = Object.keys(listElementWriteFields);

export const datascopeActions: readonly ProviderActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_answers",
    operationType: "read",
    description:
      "List DataScope answers from the v2 answers endpoint with stable top-level metadata and dynamic answer values grouped under answers.",
    inputSchema: s.object(
      {
        ...answersFilterSchemaShape,
        dateModified: s.boolean("Whether DataScope should filter answers by modified date instead of created date."),
        limit: s.integer("The maximum number of answers to return. DataScope allows at most 200.", {
          minimum: 1,
          maximum: 200,
        }),
        offset: s.nonNegativeInteger("The zero-based offset used to fetch the next page."),
      },
      { optional: [...answersOptional, "dateModified", "limit", "offset"] },
    ),
    outputSchema: s.actionOutput({
      answers: s.array("The normalized answers returned by DataScope.", datascopeAnswerSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "list_answers_with_full_metadata",
    operationType: "read",
    description:
      "List DataScope answers from the metadata-rich answers endpoint and normalize each question item into a stable questions array.",
    inputSchema: s.object({ ...answersFilterSchemaShape }, { optional: answersOptional }),
    outputSchema: s.actionOutput({
      answers: s.array("The normalized answers with per-question metadata.", datascopeAnswerWithMetadataSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "list_locations",
    operationType: "read",
    description: "List DataScope locations available to the authenticated account.",
    inputSchema: noInputSchema,
    outputSchema: s.actionOutput({
      locations: s.array("The normalized locations returned by DataScope.", datascopeLocationSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "create_location",
    operationType: "write",
    description: "Create a DataScope location using the official locations endpoint.",
    inputSchema: s.object(
      {
        ...locationWriteFields,
        code: s.nonEmptyString("The location code to store in DataScope."),
        name: s.nonEmptyString("The location name to store in DataScope."),
      },
      { required: ["code", "name"], optional: locationOptional.filter((key) => key !== "code" && key !== "name") },
    ),
    outputSchema: s.actionOutput({ location: datascopeLocationSchema }),
  }),
  defineProviderAction(service, {
    name: "update_location",
    operationType: "write",
    description: "Update one DataScope location by location ID.",
    inputSchema: s.object(
      { locationId: positiveInteger("The identifier of the DataScope location to update."), ...locationWriteFields },
      { required: ["locationId"], optional: locationOptional },
    ),
    outputSchema: s.actionOutput({ location: datascopeLocationSchema }),
  }),
  defineProviderAction(service, {
    name: "list_list_elements",
    operationType: "read",
    description: "List all elements from one DataScope metadata list type.",
    inputSchema: s.actionInput(
      {
        metadataType: s.nonEmptyString("The metadata list type, such as products or customers."),
      },
      ["metadataType"],
    ),
    outputSchema: s.actionOutput({
      elements: s.array("The normalized metadata list elements returned by DataScope.", datascopeListElementSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "get_list_element",
    operationType: "read",
    description: "Get one DataScope metadata list element by metadata type and element ID.",
    inputSchema: s.actionInput(
      {
        metadataType: s.nonEmptyString("The metadata list type that owns the element."),
        elementId: positiveInteger("The identifier of the metadata list element to fetch."),
      },
      ["metadataType", "elementId"],
    ),
    outputSchema: s.actionOutput({ element: datascopeListElementSchema }),
  }),
  defineProviderAction(service, {
    name: "create_list_element",
    operationType: "write",
    description: "Create one DataScope metadata list element under a metadata list type.",
    inputSchema: s.object(
      {
        metadataType: s.nonEmptyString("The metadata list type that will own the new element."),
        code: s.nonEmptyString("The code to store on the new metadata list element."),
        name: s.nonEmptyString("The display name of the new metadata list element."),
        description: listElementWriteFields.description,
        attribute1: listElementWriteFields.attribute1,
        attribute2: listElementWriteFields.attribute2,
      },
      { required: ["metadataType", "code", "name"], optional: ["description", "attribute1", "attribute2"] },
    ),
    outputSchema: s.actionOutput({ element: datascopeListElementSchema }),
  }),
  defineProviderAction(service, {
    name: "update_list_element",
    operationType: "write",
    description: "Update one DataScope metadata list element by element ID.",
    inputSchema: s.object(
      {
        elementId: positiveInteger("The identifier of the metadata list element to update."),
        ...listElementWriteFields,
      },
      { required: ["elementId"], optional: listElementOptional },
    ),
    outputSchema: s.actionOutput({ element: datascopeListElementSchema }),
  }),
];
