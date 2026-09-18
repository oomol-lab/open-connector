import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "qingflow" as const;

const appKeySchema = s.nonEmptyString("The Qingflow application key shown in the application URL.");
const applyIdInputSchema = s.anyOf("The Qingflow application-data record ID.", [
  s.positiveInteger("A numeric Qingflow application-data record ID."),
  s.nonEmptyString("A string Qingflow application-data record ID."),
]);
const userIdSchema = s.nonEmptyString("The Qingflow member external user ID.");
const memberIdentifierSchema = s.anyOf("A Qingflow member user ID.", [
  s.positiveInteger("A numeric Qingflow member user ID."),
  s.nonEmptyString("A string Qingflow member external user ID."),
]);
const departmentIdSchema = s.anyOf("The Qingflow department ID.", [
  s.positiveInteger("A numeric Qingflow department ID."),
  s.nonEmptyString("A string Qingflow department ID."),
]);

const pageNumberSchema = s.positiveInteger("The one-based page number.", { default: 1 });
const pageSizeSchema = s.positiveInteger("The number of items requested for this page.", {
  maximum: 200,
  default: 50,
});

const answerValueSchema = s.looseObject("One value for a Qingflow form field.", {
  value: s.string("The field value represented as text."),
  dataValue: s.string("The data value returned or accepted for this field type."),
  otherInfo: s.string("Additional field-type-specific information, such as an attachment name."),
  id: s.anyOf("An option, member, address-part, or related-record identifier.", [
    s.integer("A numeric Qingflow value identifier."),
    s.string("A string Qingflow value identifier."),
  ]),
  optionId: s.string("The external member or option identifier for supported field types."),
  ordinal: s.string("The row ordinal used by table fields."),
});

const subAnswerSchema = s.looseRequiredObject(
  "One field answer inside a Qingflow table row.",
  {
    queId: s.integer("The Qingflow field ID, including supported special field IDs."),
    queTitle: s.string("The Qingflow field title."),
    queType: s.integer("The Qingflow field type code."),
    values: s.array("Values assigned to this field.", answerValueSchema),
  },
  { optional: ["queTitle", "values"] },
);

const answerSchema = s.looseRequiredObject(
  "One Qingflow form-field answer.",
  {
    queId: s.integer("The Qingflow field ID, including supported special field IDs."),
    queTitle: s.string("The Qingflow field title."),
    queType: s.integer("The Qingflow field type code."),
    values: s.array("Values assigned to this field.", answerValueSchema),
    tableValues: s.array(
      "Rows assigned to a Qingflow table field.",
      s.array("Field answers in one Qingflow table row.", subAnswerSchema),
    ),
  },
  { optional: ["queTitle", "values", "tableValues"] },
);

const recordSortSchema = s.object("One Qingflow record sort rule.", {
  queId: s.integer("The Qingflow field ID, including supported special field IDs."),
  isAscend: s.boolean("Whether this field is sorted in ascending order."),
});

const recordQuerySchema = s.object(
  "One field-level Qingflow record filter.",
  {
    queId: s.integer("The Qingflow field ID, including supported special field IDs."),
    searchKey: s.string("A single keyword matched against this field."),
    searchKeys: s.stringArray("Alternative keywords matched with OR semantics."),
    minValue: s.string("The inclusive minimum number or earliest date value."),
    maxValue: s.string("The inclusive maximum number or latest date value."),
    scope: s.integer("Whether matching records may contain any, filled, or empty field values.", {
      minimum: 1,
      maximum: 3,
    }),
    searchOptions: s.array(
      "Selection option IDs that must appear in the field answer.",
      s.positiveInteger("A Qingflow selection option ID."),
    ),
    searchUserIds: s.stringArray("External member user IDs that must appear in a member-field answer."),
  },
  {
    optional: ["searchKey", "searchKeys", "minValue", "maxValue", "scope", "searchOptions", "searchUserIds"],
  },
);

const mutationOutputSchema = s.object(
  "A queued Qingflow mutation.",
  {
    requestId: s.string("The request ID used to inspect asynchronous processing results."),
    applyId: s.string("The created or affected record ID when Qingflow returns it immediately."),
    applyIds: s.stringArray("The created or affected record IDs returned for a batch operation."),
  },
  { optional: ["applyId", "applyIds"] },
);

const successOutputSchema = s.object("The result of a completed Qingflow workflow command.", {
  success: s.boolean("Whether Qingflow completed the command successfully."),
});

function pageOutputSchema(description: string, itemDescription: string): JsonSchema {
  return s.object(description, {
    items: s.array("Items in the returned page.", s.looseObject(itemDescription)),
    pageNumber: s.positiveInteger("The page number returned by Qingflow."),
    pageSize: s.positiveInteger("The page size returned by Qingflow."),
    pageCount: s.nonNegativeInteger("The total number of available pages."),
    totalCount: s.nonNegativeInteger("The total number of matching items."),
  });
}

export const qingflowActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_apps",
    operationType: "read",
    description: "List Qingflow applications visible to the workspace or one specified member.",
    requiredScopes: [],
    inputSchema: s.object(
      "Optional member visibility and favorite filters for listing Qingflow applications.",
      {
        userId: userIdSchema,
        favoritesOnly: s.boolean("Whether to return only applications favorited by the member."),
      },
      { optional: ["userId", "favoritesOnly"] },
    ),
    outputSchema: s.object("Applications returned by Qingflow.", {
      items: s.array(
        "Qingflow application records available to the connected token.",
        s.looseObject("A Qingflow application and its current metadata."),
      ),
      totalCount: s.nonNegativeInteger("The number of applications returned."),
    }),
  }),
  defineProviderAction(service, {
    name: "get_form",
    operationType: "read",
    description: "Get the current form fields, options, and field metadata for a Qingflow application.",
    requiredScopes: [],
    inputSchema: s.object(
      "The Qingflow application and optional member identity used to retrieve its form.",
      {
        appKey: appKeySchema,
        userId: userIdSchema,
      },
      { optional: ["userId"] },
    ),
    outputSchema: s.object("The Qingflow application form response.", {
      form: s.looseObject("The Qingflow form and its provider-defined field metadata."),
      questionRelations: s.array(
        "Data-association rules returned with the Qingflow form.",
        s.looseObject("A Qingflow form question-relation rule."),
      ),
    }),
  }),
  defineProviderAction(service, {
    name: "list_records",
    operationType: "read",
    description: "List and filter business-data records from one Qingflow application.",
    requiredScopes: [],
    inputSchema: s.object(
      "The application, member identity, pagination, sorting, and filtering rules for Qingflow records.",
      {
        appKey: appKeySchema,
        userId: userIdSchema,
        pageNumber: pageNumberSchema,
        pageSize: pageSizeSchema,
        type: s.anyOf("The Qingflow record scope: pending records or all records.", [
          s.literal(1, { description: "Pending Qingflow records." }),
          s.literal(8, { description: "All Qingflow records." }),
        ]),
        sorts: s.array("Field-level record sort rules.", recordSortSchema),
        queriesRelation: s.stringEnum("The relationship between field queries.", ["and", "or"]),
        queries: s.array("Field-level record filters.", recordQuerySchema),
        queryKey: s.string("A keyword matched across all searchable fields."),
        applyIds: s.array("Record IDs used to restrict the result set.", applyIdInputSchema),
      },
      {
        optional: [
          "userId",
          "pageNumber",
          "pageSize",
          "type",
          "sorts",
          "queriesRelation",
          "queries",
          "queryKey",
          "applyIds",
        ],
      },
    ),
    outputSchema: pageOutputSchema(
      "A normalized page of Qingflow business-data records.",
      "A Qingflow business-data record and its field answers.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_record",
    operationType: "read",
    description: "Get one Qingflow business-data record and its current field answers.",
    requiredScopes: [],
    inputSchema: s.object("The Qingflow application and business-data record to retrieve.", {
      appKey: appKeySchema,
      applyId: applyIdInputSchema,
    }),
    outputSchema: s.object("The Qingflow business-data record response.", {
      record: s.looseObject("The Qingflow record, field answers, and current workflow metadata."),
    }),
  }),
  defineProviderAction(service, {
    name: "create_record",
    operationType: "write",
    description: "Create one business-data record in a Qingflow application and return its asynchronous request ID.",
    requiredScopes: [],
    followUpActions: ["qingflow.get_operation_result"],
    asyncLifecycle: {
      startActionId: "qingflow.create_record",
      statusActionId: "qingflow.get_operation_result",
    },
    inputSchema: s.object(
      "The Qingflow application, actor, applicant, and field answers used to create a record.",
      {
        appKey: appKeySchema,
        userId: userIdSchema,
        applyUser: s.object(
          "The Qingflow member identity used to submit the record.",
          {
            email: s.email("The applicant email address."),
            areaCode: s.string("The applicant phone-number area code."),
            mobile: s.string("The applicant mobile number."),
          },
          { optional: ["areaCode", "mobile"] },
        ),
        answers: s.array("Field answers used to create the Qingflow record.", answerSchema),
      },
      { optional: ["userId", "applyUser", "answers"] },
    ),
    outputSchema: mutationOutputSchema,
  }),
  defineProviderAction(service, {
    name: "update_record",
    operationType: "write",
    description: "Update selected field answers on one Qingflow record and return its asynchronous request ID.",
    requiredScopes: [],
    followUpActions: ["qingflow.get_operation_result"],
    asyncLifecycle: {
      startActionId: "qingflow.update_record",
      statusActionId: "qingflow.get_operation_result",
    },
    inputSchema: s.object("The Qingflow application, record, and field answers to update.", {
      appKey: appKeySchema,
      applyId: applyIdInputSchema,
      answers: s.array("Field answers to update on the Qingflow record.", answerSchema),
    }),
    outputSchema: mutationOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_operation_result",
    operationType: "read",
    description: "Get Qingflow's processing result for a create, update, or other asynchronous request.",
    requiredScopes: [],
    inputSchema: s.object("The Qingflow asynchronous request to inspect.", {
      requestId: s.nonEmptyString("The request ID returned by a Qingflow mutation."),
    }),
    outputSchema: s.object(
      "The current Qingflow operation result.",
      {
        result: s.unknown("The provider-defined result for this asynchronous operation."),
        memberInfo: s.unknown("Provider-defined member details for an asynchronous member operation."),
        successUsers: s.array(
          "Members processed successfully by an asynchronous member operation.",
          s.looseObject("A successfully processed Qingflow member."),
        ),
        errorUsers: s.array(
          "Members that failed in an asynchronous member operation.",
          s.looseObject("A failed Qingflow member and its error code."),
        ),
      },
      { optional: ["memberInfo", "successUsers", "errorUsers"] },
    ),
  }),
  defineProviderAction(service, {
    name: "list_members",
    operationType: "read",
    description: "List members in the connected Qingflow workspace.",
    requiredScopes: [],
    inputSchema: s.object(
      "Pagination for listing Qingflow workspace members.",
      { pageNumber: pageNumberSchema, pageSize: pageSizeSchema },
      { optional: ["pageNumber", "pageSize"] },
    ),
    outputSchema: pageOutputSchema(
      "A normalized page of Qingflow workspace members.",
      "A Qingflow member and their contact, role, and department metadata.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_member",
    operationType: "read",
    description: "Get one Qingflow workspace member by external user ID.",
    requiredScopes: [],
    inputSchema: s.object("The Qingflow member to retrieve.", { userId: userIdSchema }),
    outputSchema: s.object("The Qingflow member response.", {
      member: s.looseObject("The Qingflow member and their workspace metadata."),
    }),
  }),
  defineProviderAction(service, {
    name: "find_members",
    operationType: "read",
    description: "Find Qingflow workspace member IDs by email address or mobile number.",
    requiredScopes: [],
    inputSchema: s.object(
      "An email address or mobile number used to find Qingflow members.",
      {
        email: s.email("The member email address."),
        mobile: s.nonEmptyString("The member mobile number."),
      },
      { optional: ["email", "mobile"] },
    ),
    outputSchema: s.object("Qingflow members matching the supplied identity.", {
      items: s.array(
        "Member identity matches returned by Qingflow.",
        s.looseObject("A Qingflow member user ID and matched email or mobile value."),
      ),
      totalCount: s.nonNegativeInteger("The number of matching member identities."),
    }),
  }),
  defineProviderAction(service, {
    name: "list_departments",
    operationType: "read",
    description: "List Qingflow departments, optionally rooted at one department.",
    requiredScopes: [],
    inputSchema: s.object(
      "An optional department whose recursive subtree should be listed.",
      { departmentId: departmentIdSchema },
      { optional: ["departmentId"] },
    ),
    outputSchema: s.object("Departments returned by Qingflow.", {
      items: s.array(
        "Qingflow departments in the requested tree.",
        s.looseObject("A Qingflow department and its hierarchy metadata."),
      ),
      totalCount: s.nonNegativeInteger("The number of departments returned."),
    }),
  }),
  defineProviderAction(service, {
    name: "get_department",
    operationType: "read",
    description: "Get one Qingflow department by department ID.",
    requiredScopes: [],
    inputSchema: s.object("The Qingflow department to retrieve.", {
      departmentId: departmentIdSchema,
    }),
    outputSchema: s.object("The Qingflow department response.", {
      department: s.looseObject("The Qingflow department and its hierarchy metadata."),
    }),
  }),
  defineProviderAction(service, {
    name: "list_roles",
    operationType: "read",
    description: "List roles in the connected Qingflow workspace.",
    requiredScopes: [],
    inputSchema: s.object("No input is required to list Qingflow roles.", {}),
    outputSchema: s.object("Roles returned by Qingflow.", {
      items: s.array("Qingflow workspace roles.", s.looseObject("A Qingflow role.")),
      totalCount: s.nonNegativeInteger("The number of roles returned."),
    }),
  }),
  defineProviderAction(service, {
    name: "list_record_comments",
    operationType: "read",
    description: "List comments attached to one Qingflow business-data record.",
    requiredScopes: [],
    inputSchema: s.object(
      "The record and page of comments to retrieve.",
      {
        appKey: appKeySchema,
        applyId: applyIdInputSchema,
        pageNumber: pageNumberSchema,
        pageSize: pageSizeSchema,
      },
      { optional: ["pageNumber", "pageSize"] },
    ),
    outputSchema: pageOutputSchema(
      "A normalized page of Qingflow record comments.",
      "A Qingflow comment and its mentioned member IDs.",
    ),
  }),
  defineProviderAction(service, {
    name: "add_record_comment",
    operationType: "write",
    description: "Add a comment to one Qingflow business-data record.",
    requiredScopes: [],
    inputSchema: s.object(
      "The record, actor, message, and mentioned members for a new comment.",
      {
        appKey: appKeySchema,
        applyId: applyIdInputSchema,
        userId: userIdSchema,
        message: s.nonEmptyString("The comment message."),
        mentionUserIds: s.stringArray("External member user IDs mentioned by the comment."),
      },
      { optional: ["userId", "mentionUserIds"] },
    ),
    outputSchema: s.object("The created Qingflow comment.", {
      comment: s.looseObject("The created comment and its provider-assigned ID."),
    }),
  }),
  defineProviderAction(service, {
    name: "list_workflow_logs",
    operationType: "read",
    description: "List workflow-node processing logs for one Qingflow record.",
    requiredScopes: [],
    inputSchema: s.object(
      "The record and page of workflow logs to retrieve.",
      {
        appKey: appKeySchema,
        applyId: applyIdInputSchema,
        pageNumber: pageNumberSchema,
        pageSize: pageSizeSchema,
      },
      { optional: ["pageNumber", "pageSize"] },
    ),
    outputSchema: pageOutputSchema(
      "A normalized page of Qingflow workflow logs.",
      "A Qingflow workflow-node processing record.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_record_change_logs",
    operationType: "read",
    description: "List data-change logs for one Qingflow record, optionally filtered by field.",
    requiredScopes: [],
    inputSchema: s.object(
      "The record, optional field, and page of data-change logs to retrieve.",
      {
        appKey: appKeySchema,
        applyId: applyIdInputSchema,
        fieldId: s.integer("The Qingflow field ID whose changes should be returned."),
        pageNumber: pageNumberSchema,
        pageSize: pageSizeSchema,
      },
      { optional: ["fieldId", "pageNumber", "pageSize"] },
    ),
    outputSchema: pageOutputSchema(
      "A normalized page of Qingflow record-change logs.",
      "A Qingflow record-change event and its changed field values.",
    ),
  }),
  defineProviderAction(service, {
    name: "process_record",
    operationType: "write",
    description: "Submit, approve, reject, complete, or copy a Qingflow workflow node.",
    requiredScopes: [],
    inputSchema: s.object(
      "The record, actor, workflow node, decision, feedback, and optional field answers.",
      {
        appKey: appKeySchema,
        applyId: applyIdInputSchema,
        userId: userIdSchema,
        auditNodeId: s.positiveInteger("The workflow node ID being processed."),
        decision: s.stringEnum("The workflow decision to apply.", [
          "submit",
          "approve",
          "reject",
          "start",
          "resubmit",
          "cc",
        ]),
        feedback: s.string("Optional workflow-processing feedback."),
        answers: s.array("Field answers changed while processing the workflow node.", answerSchema),
      },
      { optional: ["feedback", "answers"] },
    ),
    outputSchema: successOutputSchema,
  }),
  defineProviderAction(service, {
    name: "urge_record",
    operationType: "write",
    description: "Send a Qingflow reminder for one in-progress business-data record.",
    requiredScopes: [],
    inputSchema: s.object("The record and applicant identity used to send a reminder.", {
      appKey: appKeySchema,
      applyId: applyIdInputSchema,
      userId: userIdSchema,
    }),
    outputSchema: s.object("The Qingflow record that was urged.", {
      applyId: s.string("The urged Qingflow record ID."),
    }),
  }),
  defineProviderAction(service, {
    name: "reassign_record",
    operationType: "write",
    description: "Reassign active approval or fill-in nodes on one Qingflow record.",
    requiredScopes: [],
    inputSchema: s.object("The record and workflow-node reassignments to apply.", {
      appKey: appKeySchema,
      applyId: applyIdInputSchema,
      reassignments: s.array(
        "Workflow nodes and their replacement member user IDs.",
        s.object("One Qingflow workflow-node reassignment.", {
          auditNodeId: s.positiveInteger("The active workflow node ID to reassign."),
          userIds: s.array("Replacement member user IDs.", memberIdentifierSchema, {
            minItems: 1,
          }),
        }),
        { minItems: 1 },
      ),
    }),
    outputSchema: s.object("The reassigned Qingflow record.", {
      applyId: s.string("The reassigned Qingflow record ID."),
    }),
  }),
  defineProviderAction(service, {
    name: "rollback_record",
    operationType: "destructive",
    description: "Roll one Qingflow record back to an allowed earlier workflow node.",
    requiredScopes: [],
    inputSchema: s.object(
      "The record, actor, current node, target node, and optional rollback feedback.",
      {
        appKey: appKeySchema,
        applyId: applyIdInputSchema,
        userId: userIdSchema,
        auditNodeId: s.positiveInteger("The current workflow node ID."),
        targetAuditNodeId: s.positiveInteger("The workflow node ID to roll back to."),
        feedback: s.string("Rollback feedback with at most 200 characters.", {
          maxLength: 200,
        }),
      },
      { optional: ["feedback"] },
    ),
    outputSchema: successOutputSchema,
  }),
];
