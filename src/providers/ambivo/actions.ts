import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "ambivo";

const tagsSchema = s.nullable(
  s.array("Tags to attach to the CRM record. Ambivo accepts up to 10 tags.", s.string("One tag."), {
    maxItems: 10,
  }),
);

const socialProfilesSchema = s.nullable(
  s.array(
    "Social profile objects forwarded to Ambivo, such as a LinkedIn URL object.",
    s.looseObject("One social profile object accepted by Ambivo."),
  ),
);

const matchFilterSchema = s.looseObject(
  "MongoDB-style filter object encoded into Ambivo's match_filter_dict query parameter.",
);

const sortSchema = s.record(
  "Sort fields encoded into Ambivo's sort_dict query parameter. Use 1 for ascending and -1 for descending.",
  s.integer("The sort direction for one Ambivo field.", { minimum: -1, maximum: 1 }),
);

const pageSizeSchema = s.integer("The number of records to request from Ambivo.", {
  minimum: 1,
  maximum: 500,
});

const pageNumSchema = s.integer("The 1-indexed Ambivo page number to request.", { minimum: 1 });

const personWriteFields = {
  name: s.nonEmptyString("Full name for the Ambivo lead or contact."),
  email: s.nullable(s.string("Primary email address for the Ambivo lead or contact.", { maxLength: 254 })),
  phone: s.nullable(s.string("Primary phone number for the Ambivo lead or contact.", { maxLength: 20 })),
  source: s.nullable(s.string("Marketing source for the Ambivo lead or contact.", { maxLength: 100 })),
  status: s.nullable(s.string("Status for the Ambivo lead or contact.", { maxLength: 50 })),
  comments: s.nullable(s.string("Initial or updated notes for the Ambivo lead or contact.", { maxLength: 5000 })),
  tags: tagsSchema,
  employerName: s.nullable(s.string("Company name for the Ambivo lead or contact.", { maxLength: 500 })),
  profession: s.nullable(s.string("Occupation for the Ambivo lead or contact.", { maxLength: 200 })),
  title: s.nullable(s.string("Title indexed for Ambivo search.", { maxLength: 200 })),
  ssn: s.nullable(s.string("Social security number in XXX-XX-XXXX or XXXXXXXXX format.", { maxLength: 11 })),
  website: s.nullable(s.string("Website URL for the Ambivo lead or contact.", { maxLength: 2048 })),
  birthYear: s.nullableInteger("Four-digit birth year for the Ambivo lead or contact."),
  birthMonth: s.nullableInteger("Birth month number for the Ambivo lead or contact.", {
    minimum: 1,
    maximum: 12,
  }),
  birthDay: s.nullableInteger("Birth day number for the Ambivo lead or contact.", {
    minimum: 1,
    maximum: 31,
  }),
  decisionDate: s.nullableInteger("Decision date as a Unix epoch timestamp in seconds."),
  businessNeedDescription: s.nullable(
    s.string("Free-text business need for the Ambivo lead or contact.", { maxLength: 10000 }),
  ),
  socialProfiles: socialProfilesSchema,
};

const listRecordsInputSchema = s.object(
  "Query parameters for listing Ambivo CRM records.",
  {
    matchFilter: matchFilterSchema,
    evalObjectId: s.boolean("Whether Ambivo should evaluate ObjectId syntax in matchFilter."),
    sort: sortSchema,
    pageSize: pageSizeSchema,
    pageNum: pageNumSchema,
    startDate: s.nonEmptyString("Start of the Ambivo created-date range in ISO 8601 format or YYYY-MM-DD."),
    endDate: s.nonEmptyString("End of the Ambivo created-date range in ISO 8601 format or YYYY-MM-DD."),
  },
  {
    optional: ["matchFilter", "evalObjectId", "sort", "pageSize", "pageNum", "startDate", "endDate"],
  },
);

const listContactsInputSchema = s.object(
  "Query parameters for listing Ambivo CRM contacts.",
  {
    matchFilter: matchFilterSchema,
    evalObjectId: s.boolean("Whether Ambivo should evaluate ObjectId syntax in matchFilter."),
    sort: sortSchema,
    pageSize: pageSizeSchema,
    startDate: s.nonEmptyString("Start of the Ambivo created-date range in ISO 8601 format or YYYY-MM-DD."),
    endDate: s.nonEmptyString("End of the Ambivo created-date range in ISO 8601 format or YYYY-MM-DD."),
  },
  {
    optional: ["matchFilter", "evalObjectId", "sort", "pageSize", "startDate", "endDate"],
  },
);

const taskWriteFields = {
  name: s.nonEmptyString("Task title."),
  description: s.nullable(s.string("Task details.", { maxLength: 10000 })),
  status: s.nullable(s.string("Task status such as assigned, in-progress, or completed.", { maxLength: 50 })),
  priority: s.nullableInteger("Task priority where 1 is highest and 4 is lowest.", {
    minimum: 1,
    maximum: 4,
  }),
  dueDate: s.nullableInteger("Task due date as a Unix epoch timestamp in seconds."),
  subjectType: s.nullable(s.string("Entity type linked to the task.", { maxLength: 100 })),
  subject: s.nullable(s.string("ObjectId of the entity linked to the task.", { maxLength: 100 })),
  userId: s.nullable(s.string("Ambivo user ID assigned to the task.", { maxLength: 100 })),
  action: s.nullable(s.string("Task type such as general, call, email, or text.", { maxLength: 50 })),
  actionData: s.nullable(s.looseObject("Action-specific details for the task.")),
  tags: tagsSchema,
};

const crmRecordSchema = s.looseObject("The Ambivo CRM record returned by the API.");

const paginatedRecordListSchema = (description: string, arrayField: string, itemDescription: string) =>
  s.requiredObject(description, {
    [arrayField]: s.array(itemDescription, crmRecordSchema),
    pageSize: s.nullable(s.integer("The Ambivo page size returned by the API.")),
    pageNum: s.nullable(s.integer("The Ambivo page number returned by the API.")),
    raw: s.looseObject("The raw Ambivo response payload."),
  });

const recordOutputSchema = s.requiredObject("The Ambivo CRM record response.", {
  record: crmRecordSchema,
  raw: s.looseObject("The raw Ambivo response payload."),
});

export const ambivoActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_leads",
    operationType: "read",
    description: "List Ambivo CRM leads with optional filters, sorting, pagination, and date range.",
    inputSchema: listRecordsInputSchema,
    outputSchema: paginatedRecordListSchema(
      "The Ambivo lead list response.",
      "leads",
      "The Ambivo lead records returned by the API.",
    ),
  }),
  defineProviderAction(service, {
    name: "create_lead",
    operationType: "write",
    description: "Create a new Ambivo CRM lead.",
    inputSchema: s.object("Fields for creating an Ambivo lead.", personWriteFields, { required: ["name"] }),
    outputSchema: recordOutputSchema,
  }),
  defineProviderAction(service, {
    name: "update_lead",
    operationType: "write",
    description: "Update an existing Ambivo CRM lead by ID.",
    inputSchema: s.object(
      "Fields for updating an Ambivo lead.",
      {
        leadId: s.nonEmptyString("The Ambivo lead record ID."),
        ...personWriteFields,
      },
      { required: ["leadId"] },
    ),
    outputSchema: recordOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_contacts",
    operationType: "read",
    description: "List Ambivo CRM contacts with optional filters, sorting, and date range.",
    inputSchema: listContactsInputSchema,
    outputSchema: s.requiredObject("The Ambivo contact list response.", {
      contacts: s.array("The Ambivo contact records returned by the API.", crmRecordSchema),
      raw: s.anyOf("The raw Ambivo response payload.", [
        s.array("The raw Ambivo contact array returned by the API.", crmRecordSchema),
        s.looseObject("The raw Ambivo contact object returned by the API."),
      ]),
    }),
  }),
  defineProviderAction(service, {
    name: "create_contact",
    operationType: "write",
    description: "Create a new Ambivo CRM contact.",
    inputSchema: s.object("Fields for creating an Ambivo contact.", personWriteFields, { required: ["name"] }),
    outputSchema: recordOutputSchema,
  }),
  defineProviderAction(service, {
    name: "update_contact",
    operationType: "write",
    description: "Update an existing Ambivo CRM contact by ID.",
    inputSchema: s.object(
      "Fields for updating an Ambivo contact.",
      {
        contactId: s.nonEmptyString("The Ambivo contact record ID."),
        ...personWriteFields,
      },
      { required: ["contactId"] },
    ),
    outputSchema: recordOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_tasks",
    operationType: "read",
    description: "List Ambivo CRM tasks with optional filters, sorting, and pagination.",
    inputSchema: s.object(
      "Query parameters for listing Ambivo CRM tasks.",
      {
        matchFilter: matchFilterSchema,
        sort: sortSchema,
        pageSize: pageSizeSchema,
        pageNum: pageNumSchema,
      },
      { optional: ["matchFilter", "sort", "pageSize", "pageNum"] },
    ),
    outputSchema: paginatedRecordListSchema(
      "The Ambivo task list response.",
      "tasks",
      "The Ambivo task records returned by the API.",
    ),
  }),
  defineProviderAction(service, {
    name: "create_task",
    operationType: "write",
    description: "Create a new Ambivo CRM task.",
    inputSchema: s.object("Fields for creating an Ambivo task.", taskWriteFields, { required: ["name"] }),
    outputSchema: recordOutputSchema,
  }),
  defineProviderAction(service, {
    name: "update_task",
    operationType: "write",
    description: "Update an existing Ambivo CRM task by ID.",
    inputSchema: s.object(
      "Fields for updating an Ambivo task.",
      {
        taskId: s.nonEmptyString("The Ambivo task record ID."),
        ...taskWriteFields,
        isCompleted: s.nullableBoolean("Whether the task is completed."),
        completedDate: s.nullableInteger("Task completion date as a Unix epoch timestamp in seconds."),
      },
      { required: ["taskId"] },
    ),
    outputSchema: recordOutputSchema,
  }),
  defineProviderAction(service, {
    name: "delete_task",
    operationType: "destructive",
    description: "Delete an Ambivo CRM task by ID.",
    inputSchema: s.requiredObject("Input for deleting an Ambivo task.", {
      taskId: s.nonEmptyString("The Ambivo task record ID."),
    }),
    outputSchema: s.requiredObject("The Ambivo delete-task confirmation.", {
      deleted: s.boolean("Whether Ambivo reported the task as deleted."),
      ids: s.array("The deleted Ambivo task IDs.", s.string("One deleted task ID.")),
      raw: s.looseObject("The raw Ambivo response payload."),
    }),
  }),
];
