import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "membervault";

const rawPayloadSchema = s.unknown("The raw MemberVault API response payload.");

const courseIdValueSchema = s.anyOf("The MemberVault course identifier.", [
  s.integer("The numeric MemberVault course identifier."),
  s.string("The MemberVault course identifier as returned by the API."),
]);

const nullableCourseIdValueSchema = s.anyOf("The MemberVault course identifier when available.", [
  courseIdValueSchema,
  { type: "null", description: "No course identifier was returned." },
]);

const courseSchema = s.looseObject("A normalized MemberVault product or course.", {
  courseId: nullableCourseIdValueSchema,
  courseName: s.nullable(s.string("The MemberVault product or course name when available.")),
  raw: s.looseObject("The raw course object returned by MemberVault."),
});

const userIdValueSchema = s.anyOf("The MemberVault user identifier when returned.", [
  s.integer("The numeric MemberVault user identifier."),
  s.string("The MemberVault user identifier as returned by the API."),
  { type: "null", description: "No user identifier was returned." },
]);

const messageSchema = s.nullable(s.string("A message returned by MemberVault when available."));

const emptyInputSchema = s.object("No input parameters are required.", {});

const addUserInputSchema = s.object(
  "Input parameters for adding a user to a MemberVault product.",
  {
    email: s.email("The email address of the user to add or enroll."),
    courseId: s.integer(
      "The MemberVault product or course ID. Use -1 to create the user without granting product access.",
      { minimum: -1 },
    ),
    firstName: s.nonEmptyString("The user's optional first name."),
    lastName: s.nonEmptyString("The user's optional last name."),
  },
  { optional: ["firstName", "lastName"] },
);

const removeUserInputSchema = s.requiredObject(
  "Input parameters for removing a user's access to a MemberVault product.",
  {
    email: s.email("The email address of the user whose product access should be removed."),
    courseId: s.positiveInteger("The MemberVault product or course ID to remove access from."),
  },
);

const deleteUserInputSchema = s.requiredObject("Input parameters for permanently deleting a MemberVault user.", {
  email: s.email("The email address of the user to permanently delete."),
});

const listCoursesOutputSchema = s.requiredObject("MemberVault product list response.", {
  courses: s.array("The MemberVault products or courses returned by the API.", courseSchema),
  raw: rawPayloadSchema,
});

const addUserOutputSchema = s.requiredObject("MemberVault add user response.", {
  userId: userIdValueSchema,
  message: messageSchema,
  raw: rawPayloadSchema,
});

const simpleUserActionOutputSchema = (description: string) =>
  s.requiredObject(description, {
    message: messageSchema,
    raw: rawPayloadSchema,
  });

export const membervaultActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_courses",
    operationType: "read",
    description: "List products or courses in the connected MemberVault account.",
    inputSchema: emptyInputSchema,
    outputSchema: listCoursesOutputSchema,
  }),
  defineProviderAction(service, {
    name: "add_user",
    operationType: "write",
    description: "Add a user to MemberVault and optionally grant access to one product or course.",
    inputSchema: addUserInputSchema,
    outputSchema: addUserOutputSchema,
  }),
  defineProviderAction(service, {
    name: "remove_user",
    operationType: "destructive",
    description: "Remove a user's access to one MemberVault product without deleting the user account.",
    inputSchema: removeUserInputSchema,
    outputSchema: simpleUserActionOutputSchema("MemberVault remove user response."),
  }),
  defineProviderAction(service, {
    name: "delete_user",
    operationType: "destructive",
    description: "Permanently delete a MemberVault user and their data, progress, and quiz answers.",
    inputSchema: deleteUserInputSchema,
    outputSchema: simpleUserActionOutputSchema("MemberVault delete user response."),
  }),
];
