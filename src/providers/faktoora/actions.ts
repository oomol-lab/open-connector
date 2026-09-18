import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "faktoora";

const projectIdSchema = s.string("The Faktoora project UUID.", { format: "uuid" });
const documentIdSchema = s.string("The Faktoora document UUID.", { format: "uuid" });
const documentTypeSchema = s.stringEnum("The type of Faktoora document to attach or detach.", [
  "invoice",
  "invoiceincoming",
  "letter",
  "offer",
  "reminder",
  "orderconfirmation",
]);
const projectStatusSchema = s.nonEmptyString("The project status.");

const projectFields = {
  name: s.nonEmptyString("The project name."),
  description: s.nullable(s.string("The project description.")),
  place: s.nullable(s.string("The place associated with the project.")),
  eta: s.nullable(s.string("The estimated completion time returned by Faktoora.")),
  estMinutes: s.nullable(s.nonNegativeInteger("The estimated project duration in minutes.")),
  currency: s.nullable(s.string("The project currency code.")),
  status: s.nullable(projectStatusSchema),
  customerId: s.nullable(s.string("The Faktoora customer UUID.", { format: "uuid" })),
};

const projectSchema = s.looseRequiredObject(
  "A Faktoora project.",
  {
    id: projectIdSchema,
    ...projectFields,
    customer: s.nullable(s.looseObject("The customer linked to the project.")),
    document: s.nullable(s.looseObject("The document linked to the project.")),
    createdAt: s.string("When the project was created."),
    updatedAt: s.string("When the project was last updated."),
  },
  {
    optional: [
      "description",
      "place",
      "eta",
      "estMinutes",
      "currency",
      "status",
      "customerId",
      "customer",
      "document",
      "createdAt",
      "updatedAt",
    ],
  },
);

const paginationMetaSchema = s.looseRequiredObject("Pagination metadata returned by Faktoora.", {
  page: s.positiveInteger("The current page number."),
  perPage: s.positiveInteger("The number of projects requested per page."),
  totalItems: s.nonNegativeInteger("The total number of matching projects."),
  totalPages: s.nonNegativeInteger("The total number of result pages."),
});

const projectWriteFields = {
  name: projectFields.name,
  description: projectFields.description,
  place: projectFields.place,
  eta: projectFields.eta,
  estMinutes: projectFields.estMinutes,
  currency: projectFields.currency,
  status: projectFields.status,
  customerId: projectFields.customerId,
};

export type FaktooraActionName =
  | "list_projects"
  | "create_project"
  | "get_project"
  | "update_project"
  | "delete_project"
  | "attach_project_document"
  | "detach_project_document";

export const faktooraActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_projects",
    operationType: "read",
    description: "List Faktoora projects with pagination, filtering, and sorting.",
    inputSchema: s.object(
      "Input for listing Faktoora projects.",
      {
        page: s.positiveInteger("The page number to return."),
        perPage: s.integer("The number of projects to return per page.", {
          minimum: 1,
          maximum: 100,
        }),
        keyword: s.nonEmptyString("Text to match against project names and descriptions."),
        status: s.array("Project statuses to include.", projectStatusSchema, { minItems: 1 }),
        customerId: s.array(
          "Customer UUIDs whose projects should be included.",
          s.string("One Faktoora customer UUID.", { format: "uuid" }),
          { minItems: 1 },
        ),
        sort: s.stringEnum("The project field used to sort results.", ["name", "createdAt", "updatedAt"]),
        order: s.stringEnum("The project sort direction.", ["asc", "desc"]),
      },
      { optional: ["page", "perPage", "keyword", "status", "customerId", "sort", "order"] },
    ),
    outputSchema: s.requiredObject("A paginated list of Faktoora projects.", {
      data: s.array("The projects on the requested page.", projectSchema),
      meta: paginationMetaSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "create_project",
    operationType: "write",
    description: "Create a Faktoora project.",
    inputSchema: s.object("Input for creating a Faktoora project.", projectWriteFields, {
      optional: ["description", "place", "eta", "estMinutes", "currency", "status", "customerId"],
    }),
    outputSchema: projectSchema,
  }),
  defineProviderAction(service, {
    name: "get_project",
    operationType: "read",
    description: "Retrieve a Faktoora project by UUID.",
    inputSchema: s.requiredObject("Input for retrieving a Faktoora project.", {
      projectId: projectIdSchema,
    }),
    outputSchema: projectSchema,
  }),
  defineProviderAction(service, {
    name: "update_project",
    operationType: "write",
    description: "Partially update a Faktoora project.",
    inputSchema: s.object(
      "Input for updating a Faktoora project.",
      {
        projectId: projectIdSchema,
        ...projectWriteFields,
      },
      {
        optional: ["name", "description", "place", "eta", "estMinutes", "currency", "status", "customerId"],
      },
    ),
    outputSchema: projectSchema,
  }),
  defineProviderAction(service, {
    name: "delete_project",
    operationType: "destructive",
    description: "Permanently delete a Faktoora project without deleting its attached document.",
    inputSchema: s.requiredObject("Input for deleting a Faktoora project.", {
      projectId: projectIdSchema,
    }),
    outputSchema: s.requiredObject("The Faktoora project deletion result.", {
      succeed: s.boolean("Whether Faktoora deleted the project."),
    }),
  }),
  defineProviderAction(service, {
    name: "attach_project_document",
    operationType: "write",
    description: "Attach one Faktoora document to an empty project.",
    inputSchema: s.requiredObject("Input for attaching a document to a Faktoora project.", {
      projectId: projectIdSchema,
      documentId: documentIdSchema,
      documentType: documentTypeSchema,
    }),
    outputSchema: s.looseRequiredObject("The Faktoora project-document link.", {
      id: s.string("The project-document link UUID.", { format: "uuid" }),
      projectId: projectIdSchema,
      documentId: documentIdSchema,
      documentType: documentTypeSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "detach_project_document",
    operationType: "destructive",
    description: "Detach one Faktoora document from a project.",
    inputSchema: s.requiredObject("Input for detaching a document from a Faktoora project.", {
      projectId: projectIdSchema,
      documentId: documentIdSchema,
      documentType: documentTypeSchema,
    }),
    outputSchema: s.requiredObject("The Faktoora project-document detachment result.", {
      succeed: s.boolean("Whether Faktoora detached the document."),
    }),
  }),
];
