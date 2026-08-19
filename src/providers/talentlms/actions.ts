import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "talentlms" as const;

const idField = (description: string) => s.positiveInteger(description);
const paginationInputFields = {
  pageNumber: s.positiveInteger("The TalentLMS page number to request."),
  pageSize: s.positiveInteger("The TalentLMS page size to request. TalentLMS supports up to 100."),
};
const paginationOptionalFields = ["pageNumber", "pageSize"] as const;
const linksSchema = s.looseObject("Pagination links returned by TalentLMS, such as self, first, last, prev, or next.");
const rawSchema = s.looseObject("The raw TalentLMS API response payload.");

const talentlmsUserSchema = s.looseObject("A TalentLMS user object.");
const talentlmsCourseSchema = s.looseObject("A TalentLMS course object.");
const talentlmsGroupSchema = s.looseObject("A TalentLMS group object.");
const talentlmsBranchSchema = s.looseObject("A TalentLMS branch object.");
const talentlmsCategorySchema = s.looseObject("A TalentLMS category object.");

const listUsersOutputSchema = s.object("The normalized TalentLMS user list response.", {
  users: s.array("The TalentLMS users returned by the API.", talentlmsUserSchema),
  links: linksSchema,
  raw: rawSchema,
});
const listCoursesOutputSchema = s.object("The normalized TalentLMS course list response.", {
  courses: s.array("The TalentLMS courses returned by the API.", talentlmsCourseSchema),
  links: linksSchema,
  raw: rawSchema,
});
const listGroupsOutputSchema = s.object("The normalized TalentLMS group list response.", {
  groups: s.array("The TalentLMS groups returned by the API.", talentlmsGroupSchema),
  links: linksSchema,
  raw: rawSchema,
});
const listBranchesOutputSchema = s.object("The normalized TalentLMS branch list response.", {
  branches: s.array("The TalentLMS branches returned by the API.", talentlmsBranchSchema),
  links: linksSchema,
  raw: rawSchema,
});
const listCategoriesOutputSchema = s.object("The normalized TalentLMS category list response.", {
  categories: s.array("The TalentLMS categories returned by the API.", talentlmsCategorySchema),
  links: linksSchema,
  raw: rawSchema,
});

const userOutputSchema = s.object("The normalized TalentLMS user response.", {
  user: talentlmsUserSchema,
  raw: rawSchema,
});
const courseOutputSchema = s.object("The normalized TalentLMS course response.", {
  course: talentlmsCourseSchema,
  raw: rawSchema,
});
const groupOutputSchema = s.object("The normalized TalentLMS group response.", {
  group: talentlmsGroupSchema,
  raw: rawSchema,
});
const branchOutputSchema = s.object("The normalized TalentLMS branch response.", {
  branch: talentlmsBranchSchema,
  raw: rawSchema,
});
const categoryOutputSchema = s.object("The normalized TalentLMS category response.", {
  category: talentlmsCategorySchema,
  raw: rawSchema,
});

const deleteOutputSchema = s.object("The normalized TalentLMS delete response.", {
  deleted: s.boolean("Whether the TalentLMS delete request completed successfully."),
  raw: s.looseObject("The raw TalentLMS API response payload, or an empty object for 204 responses."),
});

const userWriteFields = {
  email: s.email("The user's email address."),
  firstName: s.string("The user's first name.", { minLength: 1 }),
  lastName: s.string("The user's last name.", { minLength: 1 }),
  login: s.string("The user's TalentLMS login name.", { minLength: 1 }),
  password: s.string("The user's password.", { minLength: 1 }),
  userType: s.string("The TalentLMS user type, such as learner, trainer, or administrator.", {
    minLength: 1,
  }),
  timezone: s.string("The user's timezone value accepted by TalentLMS.", { minLength: 1 }),
  language: s.string("The user's language value accepted by TalentLMS.", { minLength: 1 }),
  status: s.string("The user's TalentLMS status value.", { minLength: 1 }),
  rawFields: s.looseObject("Additional official TalentLMS user fields to send unchanged in the JSON request body."),
};
const userWriteOptionalFields = ["userType", "timezone", "language", "status", "rawFields"] as const;

export const talentlmsActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "health_check",
    description: "Check whether the configured TalentLMS API domain and API key can reach API v2.",
    requiredScopes: [],
    inputSchema: s.object("No input parameters are required for the TalentLMS health check.", {}),
    outputSchema: s.object("The TalentLMS health check response.", {
      healthy: s.boolean("Whether the TalentLMS health endpoint responded successfully."),
      raw: rawSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_users",
    description: "List TalentLMS users with optional API v2 pagination.",
    requiredScopes: [],
    inputSchema: s.object("Input parameters for listing TalentLMS users.", paginationInputFields, {
      optional: paginationOptionalFields,
    }),
    outputSchema: listUsersOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_user",
    description: "Get a TalentLMS user by ID.",
    requiredScopes: [],
    inputSchema: s.object("Input parameters for getting a TalentLMS user.", {
      userId: idField("The TalentLMS user ID."),
    }),
    outputSchema: userOutputSchema,
  }),
  defineProviderAction(service, {
    name: "create_user",
    description: "Create a TalentLMS user with common user fields and optional raw API fields.",
    requiredScopes: [],
    inputSchema: s.object("Input parameters for creating a TalentLMS user.", userWriteFields, {
      optional: userWriteOptionalFields,
    }),
    outputSchema: userOutputSchema,
  }),
  defineProviderAction(service, {
    name: "update_user",
    description: "Update a TalentLMS user with common user fields and optional raw API fields.",
    requiredScopes: [],
    inputSchema: s.object(
      "Input parameters for updating a TalentLMS user.",
      {
        userId: idField("The TalentLMS user ID."),
        ...userWriteFields,
      },
      {
        optional: ["email", "firstName", "lastName", "login", "password", ...userWriteOptionalFields],
      },
    ),
    outputSchema: userOutputSchema,
  }),
  defineProviderAction(service, {
    name: "delete_user",
    description: "Delete a TalentLMS user by ID.",
    requiredScopes: [],
    inputSchema: s.object("Input parameters for deleting a TalentLMS user.", {
      userId: idField("The TalentLMS user ID."),
    }),
    outputSchema: deleteOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_courses",
    description: "List TalentLMS courses with optional API v2 pagination.",
    requiredScopes: [],
    inputSchema: s.object("Input parameters for listing TalentLMS courses.", paginationInputFields, {
      optional: paginationOptionalFields,
    }),
    outputSchema: listCoursesOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_course",
    description: "Get a TalentLMS course by ID.",
    requiredScopes: [],
    inputSchema: s.object("Input parameters for getting a TalentLMS course.", {
      courseId: idField("The TalentLMS course ID."),
    }),
    outputSchema: courseOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_groups",
    description: "List TalentLMS groups with optional API v2 pagination.",
    requiredScopes: [],
    inputSchema: s.object("Input parameters for listing TalentLMS groups.", paginationInputFields, {
      optional: paginationOptionalFields,
    }),
    outputSchema: listGroupsOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_group",
    description: "Get a TalentLMS group by ID.",
    requiredScopes: [],
    inputSchema: s.object("Input parameters for getting a TalentLMS group.", {
      groupId: idField("The TalentLMS group ID."),
    }),
    outputSchema: groupOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_branches",
    description: "List TalentLMS branches with optional API v2 pagination.",
    requiredScopes: [],
    inputSchema: s.object("Input parameters for listing TalentLMS branches.", paginationInputFields, {
      optional: paginationOptionalFields,
    }),
    outputSchema: listBranchesOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_branch",
    description: "Get a TalentLMS branch by ID.",
    requiredScopes: [],
    inputSchema: s.object("Input parameters for getting a TalentLMS branch.", {
      branchId: idField("The TalentLMS branch ID."),
    }),
    outputSchema: branchOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_categories",
    description: "List TalentLMS categories with optional API v2 pagination.",
    requiredScopes: [],
    inputSchema: s.object("Input parameters for listing TalentLMS categories.", paginationInputFields, {
      optional: paginationOptionalFields,
    }),
    outputSchema: listCategoriesOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_category",
    description: "Get a TalentLMS category by ID.",
    requiredScopes: [],
    inputSchema: s.object("Input parameters for getting a TalentLMS category.", {
      categoryId: idField("The TalentLMS category ID."),
    }),
    outputSchema: categoryOutputSchema,
  }),
];
