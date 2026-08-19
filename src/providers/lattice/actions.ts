import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "lattice";

const rawSchema = s.unknownObject("The raw Lattice API response payload.");
const latticeUserSchema = s.unknownObject("A Lattice user object.");
const latticeDepartmentSchema = s.unknownObject("A Lattice department object.");
const latticeTagSchema = s.unknownObject("A Lattice tag object.");
const latticeGoalSchema = s.unknownObject("A Lattice goal object.");

const paginationInputFields = {
  limit: s.integer("The maximum number of Lattice objects to return. Lattice supports 1 to 100.", {
    minimum: 1,
    maximum: 100,
  }),
  startingAfter: s.nonEmptyString("The opaque Lattice cursor to continue after."),
};

const listMetadataSchema = s.object("Cursor pagination metadata returned by Lattice.", {
  hasMore: s.boolean("Whether more objects are available after this page."),
  endingCursor: s.nullableString("The cursor to use for the next page when present."),
});

const userIdInputSchema = s.object("Input parameters for getting one Lattice user.", {
  userId: s.nonEmptyString("The Lattice user ID."),
});

const departmentIdInputSchema = s.object("Input parameters for getting one Lattice department.", {
  departmentId: s.nonEmptyString("The Lattice department ID."),
});

const goalIdInputSchema = s.object("Input parameters for getting one Lattice goal.", {
  goalId: s.nonEmptyString("The Lattice goal ID."),
});

const currentUserOutputSchema = s.object("The current Lattice user response.", {
  user: latticeUserSchema,
  raw: rawSchema,
});

const userOutputSchema = s.object("The normalized Lattice user response.", {
  user: latticeUserSchema,
  raw: rawSchema,
});

const usersOutputSchema = s.object("The normalized Lattice user list response.", {
  users: s.array("The Lattice users returned by the API.", latticeUserSchema),
  meta: listMetadataSchema,
  raw: rawSchema,
});

const departmentOutputSchema = s.object("The normalized Lattice department response.", {
  department: latticeDepartmentSchema,
  raw: rawSchema,
});

const departmentsOutputSchema = s.object("The normalized Lattice department list response.", {
  departments: s.array("The Lattice departments returned by the API.", latticeDepartmentSchema),
  meta: listMetadataSchema,
  raw: rawSchema,
});

const tagsOutputSchema = s.object("The normalized Lattice tag list response.", {
  tags: s.array("The Lattice tags returned by the API.", latticeTagSchema),
  meta: listMetadataSchema,
  raw: rawSchema,
});

const goalOutputSchema = s.object("The normalized Lattice goal response.", {
  goal: latticeGoalSchema,
  raw: rawSchema,
});

const goalsOutputSchema = s.object("The normalized Lattice goal list response.", {
  goals: s.array("The Lattice goals returned by the API.", latticeGoalSchema),
  meta: listMetadataSchema,
  raw: rawSchema,
});

export const latticeActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_current_user",
    description: "Get the Lattice user associated with the configured API key.",
    inputSchema: s.object("No input parameters are required for the Lattice current user.", {}),
    outputSchema: currentUserOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_users",
    description: "List Lattice users with optional cursor pagination and status filtering.",
    inputSchema: s.object(
      "Input parameters for listing Lattice users.",
      {
        ...paginationInputFields,
        status: s.stringEnum("The Lattice user status filter. Use null_string to request all users.", [
          "active",
          "inactive",
          "created",
          "invited",
          "null_string",
        ]),
      },
      { optional: ["limit", "startingAfter", "status"] },
    ),
    outputSchema: usersOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_user",
    description: "Get a Lattice user by ID.",
    inputSchema: userIdInputSchema,
    outputSchema: userOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_departments",
    description: "List Lattice departments with optional cursor pagination.",
    inputSchema: s.object("Input parameters for listing Lattice departments.", paginationInputFields, {
      optional: ["limit", "startingAfter"],
    }),
    outputSchema: departmentsOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_department",
    description: "Get a Lattice department by ID.",
    inputSchema: departmentIdInputSchema,
    outputSchema: departmentOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_tags",
    description: "List Lattice tags with optional cursor pagination.",
    inputSchema: s.object("Input parameters for listing Lattice tags.", paginationInputFields, {
      optional: ["limit", "startingAfter"],
    }),
    outputSchema: tagsOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_goals",
    description: "List Lattice goals with optional cursor pagination and state filtering.",
    inputSchema: s.object(
      "Input parameters for listing Lattice goals.",
      {
        ...paginationInputFields,
        state: s.stringEnum("The Lattice goal state filter.", ["active", "ended"]),
      },
      { optional: ["limit", "startingAfter", "state"] },
    ),
    outputSchema: goalsOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_goal",
    description: "Get a Lattice goal by ID.",
    inputSchema: goalIdInputSchema,
    outputSchema: goalOutputSchema,
  }),
];
