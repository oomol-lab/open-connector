import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "teamcamp";

const nonEmptyString = (description: string) => s.nonEmptyString(description);
const looseRecord = (description: string) => s.looseObject(description);

const projectSchema = s.looseObject("A Teamcamp project returned by the API.", {
  projectId: s.string("The ID of the project."),
  projectName: s.string("The name of the project."),
});

const taskSchema = s.looseObject("A Teamcamp task returned by the API.", {
  id: s.string("The task ID alias."),
  taskId: s.string("The ID of the task."),
  taskName: s.string("The name of the task."),
  status: s.boolean("Whether the task is complete."),
  createdAt: s.string("The task creation timestamp."),
  updatedAt: s.string("The task update timestamp."),
});

const userSchema = s.looseObject("A Teamcamp workspace user.", {
  id: s.string("The user ID."),
  name: s.string("The user name."),
  email: s.string("The email address."),
  phone: s.string("The phone number."),
  profile_photo: s.string("The profile photo URL."),
  isOwner: s.boolean("Whether the user owns the workspace."),
  isAdmin: s.boolean("Whether the user is an admin."),
});

const customerSchema = s.looseObject("A Teamcamp workspace customer.", {
  customerId: s.string("The customer ID."),
  address: s.string("The customer address."),
  firstName: s.string("The customer first name."),
  lastName: s.string("The customer last name."),
  email: s.string("The customer email."),
  companyName: s.string("The customer company name."),
  phone: s.string("The customer phone."),
  clients: s.array(
    "Client contacts associated with the customer.",
    s.looseObject("A Teamcamp customer client contact.", {
      clientId: s.string("The client contact ID."),
      name: s.string("The client contact name."),
      email: s.string("The client contact email."),
    }),
  ),
});

const commentSchema = s.looseObject("A Teamcamp task comment.", {
  commentId: s.string("The comment ID."),
  content: s.string("The comment content."),
});

export const teamcampActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_projects",
    description: "List all projects in the Teamcamp workspace.",
    inputSchema: s.actionInput({}),
    outputSchema: s.actionOutput({
      projects: s.array("Projects returned by Teamcamp.", projectSchema),
      raw: s.array("Raw project objects returned by Teamcamp.", looseRecord("A raw project object.")),
    }),
  }),
  defineProviderAction(service, {
    name: "get_project",
    description: "Get detailed information about one Teamcamp project.",
    inputSchema: s.actionInput(
      {
        projectId: nonEmptyString("The Teamcamp project ID."),
      },
      ["projectId"],
    ),
    outputSchema: s.actionOutput({
      project: looseRecord("The Teamcamp project detail object."),
      raw: looseRecord("The raw Teamcamp project detail object."),
    }),
  }),
  defineProviderAction(service, {
    name: "list_tasks",
    description: "List tasks in a Teamcamp project, optionally filtered by completion status.",
    inputSchema: s.actionInput(
      {
        projectId: nonEmptyString("The Teamcamp project ID."),
        complete: s.boolean("Filter tasks by completion status."),
      },
      ["projectId"],
    ),
    outputSchema: s.actionOutput({
      tasks: s.array("Tasks returned by Teamcamp.", taskSchema),
      raw: s.array("Raw task objects returned by Teamcamp.", looseRecord("A raw task object.")),
    }),
  }),
  defineProviderAction(service, {
    name: "get_task",
    description: "Get detailed information about one Teamcamp task.",
    inputSchema: s.actionInput(
      {
        taskId: nonEmptyString("The Teamcamp task ID."),
      },
      ["taskId"],
    ),
    outputSchema: s.actionOutput({
      task: looseRecord("The Teamcamp task detail object."),
      raw: looseRecord("The raw Teamcamp task detail object."),
    }),
  }),
  defineProviderAction(service, {
    name: "post_task_comment",
    description: "Post a comment to a Teamcamp task.",
    inputSchema: s.actionInput(
      {
        taskId: nonEmptyString("The Teamcamp task ID."),
        content: nonEmptyString("The comment content to post to the task."),
      },
      ["taskId", "content"],
    ),
    outputSchema: s.actionOutput({
      comment: commentSchema,
      raw: looseRecord("The raw Teamcamp comment response."),
    }),
  }),
  defineProviderAction(service, {
    name: "list_company_users",
    description: "List users in the Teamcamp workspace.",
    inputSchema: s.actionInput({}),
    outputSchema: s.actionOutput({
      users: s.array("Users returned by Teamcamp.", userSchema),
      raw: s.array("Raw user objects returned by Teamcamp.", looseRecord("A raw user object.")),
    }),
  }),
  defineProviderAction(service, {
    name: "list_customers",
    description: "List customers in the Teamcamp workspace.",
    inputSchema: s.actionInput({}),
    outputSchema: s.actionOutput({
      customers: s.array("Customers returned by Teamcamp.", customerSchema),
      raw: s.array("Raw customer objects returned by Teamcamp.", looseRecord("A raw customer object.")),
    }),
  }),
];
