import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "passcreator";

const trimmedString = (description: string) => s.nonWhitespaceString(description);

const templateSchema = s.looseRequiredObject("A pass template returned by Passcreator.", {
  identifier: trimmedString("The unique identifier of the pass template."),
  name: trimmedString("The name of the pass template."),
});

const templateFieldSchema = s.looseRequiredObject("A dynamic field configured on a pass template.", {
  key: s.string("The field key used when creating a pass."),
  label: s.string("The human-readable field label."),
  type: s.string("The Passcreator field type."),
  required: s.boolean("Whether the template requires this field."),
});

const createdPassSchema = s.looseRequiredObject("The created pass metadata returned by Passcreator.", {
  identifier: s.string("The unique identifier of the created pass."),
  downloadPage: s.url("The device-aware download page for the created pass."),
  iPhoneUri: s.url("The pkpass download URL used by Apple Wallet."),
});

const passDataSchema = s.looseRequiredObject(
  "The pass data to submit. Fields other than templateId depend on the selected template.",
  {
    templateId: trimmedString("The identifier of the pass template to use."),
  },
);

const responseErrorsSchema = s.array(
  "Errors returned by Passcreator.",
  s.unknown("An error value returned by Passcreator."),
);

const queryConditionSchema = s.looseRequiredObject("One condition in a Passcreator Query Language group.", {
  field: trimmedString("The pass field to compare."),
  operator: trimmedString("The Passcreator Query Language comparison operator."),
  value: s.anyOf("The string, number, or array value to compare against.", [
    s.string("A string comparison value."),
    s.number("A numeric comparison value."),
    s.array("Comparison values combined with OR.", s.unknown("A comparison value.")),
  ]),
});

const queryGroupSchema = s.array("Conditions combined with AND.", queryConditionSchema, {
  minItems: 1,
});

const querySchema = s.looseObject(
  "A Passcreator Query Language object. The provider encodes this object as base64url.",
  {
    title: s.nullable(s.string("An optional title stored with the query.")),
    templateId: trimmedString("Return passes created from this template."),
    projectId: trimmedString("Return passes that belong to this project."),
    searchPhrase: trimmedString("Search for this phrase across the pass data fields."),
    groups: s.array("Condition groups combined with OR.", queryGroupSchema, {
      minItems: 1,
    }),
  },
);

const formatKeyAdditionalPropertiesSchema = s.stringEnum(
  "Choose whether additional pass properties use their field identifiers or field names as keys.",
  ["id", "name"],
);

const responsePageSchema = s.looseObject("Pagination links returned by Passcreator.", {
  next: s.nullable(s.url("The URL for the next result page.")),
});

const responseMetadataSchema = s.looseRequiredObject("Pagination result counts returned by Passcreator.", {
  resultsTotal: s.nonNegativeInteger("The total number of matching passes."),
  resultsThisPage: s.nonNegativeInteger("The number of passes returned on this page."),
});

const passSchema = s.looseObject("A pass returned by Passcreator.");

const createPassResponseSchema = s.looseRequiredObject(
  "The native Passcreator response for a synchronously created pass.",
  {
    success: s.boolean("Whether Passcreator completed the request successfully."),
    statusCode: s.integer("The status code reported by Passcreator."),
    count: s.nonNegativeInteger("The number of returned result objects."),
    data: createdPassSchema,
    description: s.nullable(s.string("The response description returned by Passcreator.")),
    errors: responseErrorsSchema,
  },
  { optional: ["count", "description", "errors"] },
);

const listPassesResponseSchema = s.looseRequiredObject(
  "The native Passcreator response for a pass list or search request.",
  {
    success: s.boolean("Whether Passcreator completed the request successfully."),
    statusCode: s.integer("The status code reported by Passcreator."),
    count: s.nonNegativeInteger("The number of passes returned on this page."),
    data: s.array("The passes returned by Passcreator.", passSchema),
    description: s.nullable(s.string("The response description returned by Passcreator.")),
    errors: responseErrorsSchema,
    page: responsePageSchema,
    responseMetaData: s.nullable(responseMetadataSchema),
  },
  { optional: ["count", "description", "errors", "page", "responseMetaData"] },
);

const listPassesInputSchema = s.object(
  "The input payload for listing or searching passes.",
  {
    pageSize: s.positiveInteger("The number of passes to request for one page."),
    formatKeyAdditionalProperties: formatKeyAdditionalPropertiesSchema,
    segmentId: trimmedString("The segment identifier used to filter passes."),
    query: querySchema,
    fields: s.array("The pass fields to include in each result.", trimmedString("A Passcreator pass field name."), {
      minItems: 1,
    }),
    nextPage: s.url("The next-page URL returned by a previous list_passes response."),
  },
  {
    optional: ["pageSize", "formatKeyAdditionalProperties", "segmentId", "query", "fields", "nextPage"],
  },
);

const listPassTemplatesAction = defineProviderAction(service, {
  name: "list_pass_templates",
  operationType: "read",
  description: "List all pass templates available to the connected Passcreator account.",
  requiredScopes: [],
  inputSchema: s.requiredObject("The input payload for listing pass templates.", {}),
  outputSchema: s.array("The pass templates returned by Passcreator.", templateSchema),
});

const getPassTemplateFieldsAction = defineProviderAction(service, {
  name: "get_pass_template_fields",
  operationType: "read",
  description: "Inspect the dynamic fields configured on a Passcreator pass template.",
  requiredScopes: [],
  inputSchema: s.requiredObject("The input payload for inspecting pass template fields.", {
    templateId: trimmedString("The identifier of the pass template to inspect."),
  }),
  outputSchema: s.array("The dynamic fields configured on the pass template.", templateFieldSchema),
});

const createPassAction = defineProviderAction(service, {
  name: "create_pass",
  operationType: "write",
  description: "Create one Passcreator wallet pass synchronously from template-specific JSON data.",
  requiredScopes: [],
  inputSchema: s.requiredObject("The input payload for creating a pass.", {
    data: passDataSchema,
  }),
  outputSchema: createPassResponseSchema,
});

const listPassesAction = defineProviderAction(service, {
  name: "list_passes",
  operationType: "read",
  description: "List or search Passcreator wallet passes and continue through documented next-page links.",
  requiredScopes: [],
  inputSchema: listPassesInputSchema,
  outputSchema: listPassesResponseSchema,
});

export const passcreatorActions: readonly ActionDefinition[] = [
  listPassTemplatesAction,
  getPassTemplateFieldsAction,
  createPassAction,
  listPassesAction,
];
