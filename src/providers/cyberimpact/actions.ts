import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "cyberimpact";

const page = s.positiveInteger("The page of results to view.");
const limit = s.integer({ minimum: 1, maximum: 10000, description: "The number of results per page." });
const id = s.positiveInteger("The Cyberimpact numerical ID.");
const memberKey = s.nonEmptyString("The member email address or numerical member ID.");
const dateReturnFormat = s.stringEnum(["ISO8601", "ATOM"], {
  description: "The date format Cyberimpact should use in responses.",
});
const rawObject = s.looseObject("Raw Cyberimpact object.");
const paginationFields: Record<string, JsonSchema> = {
  totalCount: s.integer("The total number of records returned by Cyberimpact."),
  page: s.integer("The current Cyberimpact page number."),
  limit: s.integer("The Cyberimpact page size."),
  sort: s.string("The Cyberimpact sort value returned for this response."),
  raw: s.looseObject("The raw Cyberimpact response payload."),
};

const memberFields = {
  email: s.email("The member email address."),
  gender: s.stringEnum(["m", "f", "o"], { description: "The member gender code accepted by Cyberimpact." }),
  groupIds: s.array(s.positiveInteger("A Cyberimpact group ID."), {
    minItems: 1,
    description: "Cyberimpact group IDs to send as the official CSV groups field.",
  }),
  firstname: s.nonEmptyString("The member first name."),
  lastname: s.nonEmptyString("The member last name."),
  company: s.nonEmptyString("The member company name."),
  language: s.stringEnum(["en_ca", "fr_ca"], { description: "The member language code accepted by Cyberimpact." }),
  birthdate: s.date("The member birthdate in yyyy-mm-dd format."),
  postalCode: s.nonEmptyString("The member postal code."),
  country: s.nonEmptyString("The member ISO 3166-1 alpha-2 country code."),
  note: s.nonEmptyString("A note stored on the member."),
  customFields: s.record(
    "Custom field values keyed by Cyberimpact custom field ID.",
    s.unknown("A custom field value."),
  ),
};

const memberPatchOptional = [
  "email",
  "gender",
  "firstname",
  "lastname",
  "company",
  "language",
  "birthdate",
  "postalCode",
  "country",
  "note",
  "customFields",
] as const;

const objectOutput = (description: string, fieldName: string): JsonSchema =>
  s.actionOutput({ [fieldName]: rawObject }, description);

const deletionOutput = s.actionOutput(
  {
    result: s.record("The raw Cyberimpact deletion map keyed by deleted resource identifier.", s.string("Status.")),
  },
  "The Cyberimpact deletion response.",
);

export const cyberimpactActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_members",
    description: "Retrieve a paginated list of Cyberimpact members with optional status, date, and sort filters.",
    inputSchema: s.object(
      "Filters for listing Cyberimpact members.",
      {
        page,
        limit,
        status: s.stringEnum(["active", "orphans", "all"], { description: "The status filter." }),
        sort: s.stringEnum(
          [
            "email_asc",
            "email_desc",
            "language_asc",
            "language_desc",
            "fullname_asc",
            "fullname_desc",
            "date_asc",
            "date_desc",
            "consent_type_asc",
            "consent_type_desc",
            "consent_date_asc",
            "consent_date_desc",
            "updated_asc",
            "updated_desc",
          ],
          { description: "The sort order." },
        ),
        joinedOnFrom: s.date("Only return members joined on or after this date."),
        joinedOnTo: s.date("Only return members joined on or before this date."),
        updatedOnFrom: s.date("Only return members updated on or after this date."),
        updatedOnTo: s.date("Only return members updated on or before this date."),
        dateReturnFormat,
      },
      {
        optional: [
          "page",
          "limit",
          "status",
          "sort",
          "joinedOnFrom",
          "joinedOnTo",
          "updatedOnFrom",
          "updatedOnTo",
          "dateReturnFormat",
        ],
      },
    ),
    outputSchema: s.actionOutput(
      { members: s.array(rawObject, { description: "Member objects returned by Cyberimpact." }), ...paginationFields },
      "Paginated Cyberimpact members response.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_member",
    description: "Retrieve a Cyberimpact member by email address or numerical member ID.",
    inputSchema: s.object({ key: memberKey, dateReturnFormat }, { required: ["key"], description: "Input." }),
    outputSchema: objectOutput("The Cyberimpact member response.", "member"),
  }),
  defineProviderAction(service, {
    name: "create_member",
    description: "Add a member to Cyberimpact and optionally subscribe them to groups.",
    inputSchema: s.object("Input for creating a Cyberimpact member.", memberFields, {
      required: ["email"],
      optional: [
        "gender",
        "groupIds",
        "firstname",
        "lastname",
        "company",
        "language",
        "birthdate",
        "postalCode",
        "country",
        "note",
        "customFields",
      ],
    }),
    outputSchema: objectOutput("The created Cyberimpact member response.", "member"),
  }),
  defineProviderAction(service, {
    name: "update_member",
    description: "Edit one or more fields on a Cyberimpact member by email address or member ID.",
    inputSchema: s.object(
      "Input for editing a Cyberimpact member.",
      { key: memberKey, ...memberFields },
      {
        required: ["key"],
        optional: memberPatchOptional,
      },
    ),
    outputSchema: objectOutput("The updated Cyberimpact member response.", "member"),
  }),
  defineProviderAction(service, {
    name: "delete_member",
    description: "Delete a Cyberimpact member by email address or numerical member ID.",
    inputSchema: s.actionInput({ key: memberKey }, ["key"], "Input for deleting a Cyberimpact member."),
    outputSchema: deletionOutput,
  }),
  defineProviderAction(service, {
    name: "list_groups",
    description: "Retrieve a paginated list of Cyberimpact groups.",
    inputSchema: s.object(
      "Filters for listing Cyberimpact groups.",
      {
        page,
        limit,
        sort: s.stringEnum(
          [
            "group_asc",
            "group_desc",
            "nbmember_asc",
            "nbmember_desc",
            "type_asc",
            "type_desc",
            "nbnewsletter_asc",
            "nbnewsletter_desc",
            "date_asc",
            "date_desc",
          ],
          { description: "The sort order." },
        ),
        dateReturnFormat,
      },
      { optional: ["page", "limit", "sort", "dateReturnFormat"] },
    ),
    outputSchema: s.actionOutput(
      { groups: s.array(rawObject, { description: "Group objects returned by Cyberimpact." }), ...paginationFields },
      "Paginated Cyberimpact groups response.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_group",
    description: "Retrieve a Cyberimpact group by numerical ID.",
    inputSchema: s.object({ id, dateReturnFormat }, { required: ["id"], description: "Input." }),
    outputSchema: objectOutput("The Cyberimpact group response.", "group"),
  }),
  defineProviderAction(service, {
    name: "create_group",
    description: "Create a static Cyberimpact group.",
    inputSchema: s.actionInput(
      {
        title: s.nonEmptyString("The group name."),
        isPublic: s.boolean("Whether this is a public Cyberimpact group."),
      },
      ["title", "isPublic"],
      "Input for creating a Cyberimpact group.",
    ),
    outputSchema: objectOutput("The created Cyberimpact group response.", "group"),
  }),
  defineProviderAction(service, {
    name: "update_group",
    description: "Edit the title or visibility of a static Cyberimpact group.",
    inputSchema: s.object(
      {
        id,
        title: s.nonEmptyString("The group name."),
        isPublic: s.boolean("Whether this is a public Cyberimpact group."),
      },
      { required: ["id"], optional: ["title", "isPublic"], description: "Input for editing a Cyberimpact group." },
    ),
    outputSchema: objectOutput("The updated Cyberimpact group response.", "group"),
  }),
  defineProviderAction(service, {
    name: "delete_group",
    description: "Delete a Cyberimpact group by numerical ID.",
    inputSchema: s.actionInput({ id }, ["id"], "Input for deleting a Cyberimpact group."),
    outputSchema: deletionOutput,
  }),
  defineProviderAction(service, {
    name: "list_templates",
    description: "Retrieve a paginated list of Cyberimpact email templates.",
    inputSchema: s.object(
      {
        page,
        limit,
        sort: s.stringEnum(
          [
            "template_asc",
            "template_desc",
            "language_asc",
            "language_desc",
            "subject_asc",
            "subject_desc",
            "updated_asc",
            "updated_desc",
            "usage_asc",
            "usage_desc",
            "created_asc",
            "created_desc",
          ],
          { description: "The sort order." },
        ),
        dateReturnFormat,
      },
      { optional: ["page", "limit", "sort", "dateReturnFormat"], description: "Filters for listing templates." },
    ),
    outputSchema: s.actionOutput(
      {
        templates: s.array(rawObject, { description: "Template objects returned by Cyberimpact." }),
        ...paginationFields,
      },
      "Paginated Cyberimpact templates response.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_template",
    description: "Retrieve a Cyberimpact email template by numerical ID.",
    inputSchema: s.object({ id, dateReturnFormat }, { required: ["id"], description: "Input." }),
    outputSchema: objectOutput("The Cyberimpact template response.", "template"),
  }),
  defineProviderAction(service, {
    name: "create_template",
    description: "Create a Cyberimpact email template with HTML or plain text body content.",
    inputSchema: s.object(
      {
        title: s.nonEmptyString("The template title."),
        bodyHtml: s.nonEmptyString("The HTML body for the template."),
        bodyText: s.nonEmptyString("The plain text body for the template."),
      },
      { required: ["title"], optional: ["bodyHtml", "bodyText"], description: "Input for creating a template." },
    ),
    outputSchema: objectOutput("The created Cyberimpact template response.", "template"),
  }),
  defineProviderAction(service, {
    name: "replace_template",
    description: "Replace a Cyberimpact email template by numerical ID.",
    inputSchema: s.object(
      {
        id,
        title: s.nonEmptyString("The template title."),
        bodyHtml: s.nonEmptyString("The HTML body for the template."),
        bodyText: s.nonEmptyString("The plain text body for the template."),
      },
      { required: ["id", "title"], optional: ["bodyHtml", "bodyText"], description: "Input for replacing a template." },
    ),
    outputSchema: objectOutput("The replaced Cyberimpact template response.", "template"),
  }),
  defineProviderAction(service, {
    name: "delete_template",
    description: "Delete a Cyberimpact email template by numerical ID.",
    inputSchema: s.actionInput({ id }, ["id"], "Input for deleting a Cyberimpact template."),
    outputSchema: deletionOutput,
  }),
];
