import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "accredible_certificates";

const nonEmptyStringSchema = (description: string) => s.string({ description, minLength: 1, pattern: "\\S" });

const idInputSchema = nonEmptyStringSchema("The Accredible credential identifier.");
const groupIdInputSchema = s.positiveInteger("The Accredible group ID.");
const pageSizeSchema = s.positiveInteger("The number of results to request from Accredible.");
const pageSchema = s.positiveInteger("The page number to request from Accredible.");
const dateFilterSchema = s.date("A date filter in YYYY-MM-DD format.");
const looseMetadataSchema = s.looseObject("Provider-defined metadata object passed through to Accredible.");
const stringMetadataSchema = s.record(
  "String metadata key/value pairs passed through to Accredible.",
  s.string("A metadata value."),
);
const idSearchSchema = s.anyOf("An Accredible ID represented as either a number or string.", [
  s.positiveInteger("A numeric Accredible ID."),
  nonEmptyStringSchema("A string Accredible ID."),
]);

const paginationMetaSchema = s.object("Normalized Accredible pagination metadata.", {
  currentPage: s.nullable(s.number("The current page reported by Accredible.")),
  nextPage: s.nullable(s.number("The next page reported by Accredible.")),
  prevPage: s.nullable(s.number("The previous page reported by Accredible.")),
  totalPages: s.nullable(s.number("The total page count reported by Accredible.")),
  totalCount: s.nullable(s.number("The total item count reported by Accredible.")),
  raw: s.looseObject("The raw pagination object returned by Accredible."),
});

const recipientSchema = s.object("Normalized Accredible recipient details.", {
  id: s.nullable(s.string("The Accredible recipient ID when returned.")),
  name: s.nullable(s.string("The recipient name.")),
  email: s.nullable(s.string("The recipient email address.")),
  metaData: s.nullable(s.looseObject("The recipient metadata returned by Accredible.")),
});

const credentialSchema = s.object("Normalized Accredible credential details.", {
  id: s.string("The credential ID as a string."),
  name: s.nullable(s.string("The credential name.")),
  description: s.nullable(s.string("The credential description.")),
  complete: s.nullable(s.boolean("Whether Accredible marks the credential complete.")),
  issuedOn: s.nullable(s.string("The credential issue date returned by Accredible.")),
  expiredOn: s.nullable(s.string("The credential expiry date returned by Accredible.")),
  groupId: s.nullable(s.number("The Accredible group ID when returned.")),
  groupName: s.nullable(s.string("The Accredible group name when returned.")),
  url: s.nullable(s.string("The public credential URL when returned.")),
  encodedId: s.nullable(s.string("The encoded credential ID when returned.")),
  private: s.nullable(s.boolean("Whether the credential is private.")),
  recipient: s.nullable(recipientSchema),
  raw: s.looseObject("The raw credential object returned by Accredible."),
});

const groupSchema = s.object("Normalized Accredible group details.", {
  id: s.number("The Accredible group ID."),
  name: s.nullable(s.string("The group name.")),
  courseName: s.nullable(s.string("The group course name.")),
  courseDescription: s.nullable(s.string("The group course description.")),
  language: s.nullable(s.string("The group language code.")),
  designName: s.nullable(s.string("The associated design name.")),
  departmentId: s.nullable(s.number("The Accredible department ID when returned.")),
  raw: s.looseObject("The raw group object returned by Accredible."),
});

export const accredibleCertificatesActions: readonly ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_groups",
    description: "List Accredible credential groups available to the API key.",
    requiredScopes: [],
    inputSchema: s.object("The input payload for listing Accredible groups.", {}),
    outputSchema: s.object("The response returned when listing Accredible groups.", {
      groups: s.array("The groups returned by Accredible.", groupSchema),
      meta: paginationMetaSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "get_group",
    description: "Get one Accredible credential group by group ID.",
    requiredScopes: [],
    inputSchema: s.object("The input payload for reading one Accredible group.", {
      group_id: groupIdInputSchema,
    }),
    outputSchema: s.object("The response returned when reading one Accredible group.", {
      group: groupSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "search_groups",
    description: "Search Accredible credential groups with documented filters.",
    requiredScopes: [],
    inputSchema: s.object(
      "The input payload for searching Accredible groups.",
      {
        ids: s.array("The Accredible group IDs to include.", groupIdInputSchema, { minItems: 1 }),
        name: nonEmptyStringSchema("A group name substring used for partial matching."),
        course_name: nonEmptyStringSchema("A course name substring used for partial matching."),
        department_id: s.positiveInteger("The Accredible department ID to filter by."),
        meta_data: stringMetadataSchema,
        start_updated_date: dateFilterSchema,
        end_updated_date: dateFilterSchema,
        page_size: pageSizeSchema,
        page: pageSchema,
      },
      {
        optional: [
          "ids",
          "name",
          "course_name",
          "department_id",
          "meta_data",
          "start_updated_date",
          "end_updated_date",
          "page_size",
          "page",
        ],
      },
    ),
    outputSchema: s.object("The response returned when searching Accredible groups.", {
      groups: s.array("The groups returned by Accredible.", groupSchema),
      meta: paginationMetaSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_credentials",
    description: "List Accredible credentials with documented query filters.",
    requiredScopes: [],
    inputSchema: s.object(
      "The input payload for listing Accredible credentials.",
      {
        group_id: idSearchSchema,
        email: s.email("The recipient email address to filter credentials by."),
        recipient_id: idSearchSchema,
        license_id: nonEmptyStringSchema("The Accredible license ID to filter credentials by."),
        start_date: dateFilterSchema,
        end_date: dateFilterSchema,
        start_updated_date: dateFilterSchema,
        end_updated_date: dateFilterSchema,
        page_size: pageSizeSchema,
        page: pageSchema,
      },
      {
        optional: [
          "group_id",
          "email",
          "recipient_id",
          "license_id",
          "start_date",
          "end_date",
          "start_updated_date",
          "end_updated_date",
          "page_size",
          "page",
        ],
      },
    ),
    outputSchema: s.object("The response returned when listing Accredible credentials.", {
      credentials: s.array("The credentials returned by Accredible.", credentialSchema),
      meta: paginationMetaSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "get_credential",
    description: "Get one Accredible credential by credential ID.",
    requiredScopes: [],
    inputSchema: s.object("The input payload for reading one Accredible credential.", {
      id: idInputSchema,
    }),
    outputSchema: s.object("The response returned when reading one Accredible credential.", {
      credential: credentialSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "search_credentials",
    description: "Search Accredible credentials with documented filters.",
    requiredScopes: [],
    inputSchema: s.object(
      "The input payload for searching Accredible credentials.",
      {
        group_id: idSearchSchema,
        "recipient.name": nonEmptyStringSchema("A recipient name substring used for matching."),
        "recipient.email": s.email("The recipient email address to match."),
        "recipient.id": idSearchSchema,
        "recipient.meta_data": looseMetadataSchema,
        license_id: nonEmptyStringSchema("The Accredible license ID to filter credentials by."),
        meta_data: looseMetadataSchema,
        start_date: dateFilterSchema,
        end_date: dateFilterSchema,
        start_updated_date: dateFilterSchema,
        end_updated_date: dateFilterSchema,
        page_size: pageSizeSchema,
        page: pageSchema,
      },
      {
        optional: [
          "group_id",
          "recipient.name",
          "recipient.email",
          "recipient.id",
          "recipient.meta_data",
          "license_id",
          "meta_data",
          "start_date",
          "end_date",
          "start_updated_date",
          "end_updated_date",
          "page_size",
          "page",
        ],
      },
    ),
    outputSchema: s.object("The response returned when searching Accredible credentials.", {
      credentials: s.array("The credentials returned by Accredible.", credentialSchema),
      meta: paginationMetaSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "create_credential",
    description: "Create one Accredible credential using JSON recipient and group fields.",
    requiredScopes: [],
    inputSchema: s.object(
      "The input payload for creating one Accredible credential.",
      {
        id: nonEmptyStringSchema("The issuer-defined credential ID."),
        group_id: groupIdInputSchema,
        "recipient.name": nonEmptyStringSchema("The recipient name."),
        "recipient.email": s.email("The recipient email address."),
        "recipient.phone_number": nonEmptyStringSchema("The recipient phone number."),
        "recipient.id": idSearchSchema,
        "recipient.meta_data": looseMetadataSchema,
        name: nonEmptyStringSchema("The credential name."),
        description: nonEmptyStringSchema("The credential description."),
        custom_attributes: looseMetadataSchema,
        issued_on: dateFilterSchema,
        expired_on: dateFilterSchema,
        complete: s.boolean("Whether the credential should be marked complete."),
        private: s.boolean("Whether Accredible should create the credential as private."),
        approve: s.boolean("Whether Accredible should approve the credential."),
        allow_supplemental_evidence: s.boolean("Whether supplemental evidence is allowed for the credential."),
        allow_supplemental_references: s.boolean("Whether supplemental references are allowed for the credential."),
        meta_data: looseMetadataSchema,
      },
      {
        optional: [
          "id",
          "recipient.phone_number",
          "recipient.id",
          "recipient.meta_data",
          "name",
          "description",
          "custom_attributes",
          "issued_on",
          "expired_on",
          "complete",
          "private",
          "approve",
          "allow_supplemental_evidence",
          "allow_supplemental_references",
          "meta_data",
        ],
      },
    ),
    outputSchema: s.object("The response returned when creating one Accredible credential.", {
      credential: credentialSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "delete_credential",
    description: "Delete one Accredible credential by credential ID.",
    requiredScopes: [],
    inputSchema: s.object("The input payload for deleting one Accredible credential.", {
      id: idInputSchema,
    }),
    outputSchema: s.object("The response returned when deleting one Accredible credential.", {
      deleted: s.boolean("Whether the delete request completed successfully."),
      credential: s.nullable(credentialSchema),
    }),
  }),
];
