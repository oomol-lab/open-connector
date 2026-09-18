import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "kintone";

const id = s.positiveInteger("A Kintone numeric ID.");
const ids = s.array("A list of Kintone numeric IDs. Up to 100 IDs can be specified.", id, {
  minItems: 1,
  maxItems: 100,
});
const code = s.nonEmptyString("A Kintone code value.");
const codes = s.stringArray("A list of Kintone code values. Up to 100 codes can be specified.", {
  minItems: 1,
  maxItems: 100,
});
const offset = s.nonNegativeInteger("The result offset. Kintone defaults this to 0.");
const size = s.integer("The maximum number of records to return. Kintone defaults this to 100.", {
  minimum: 1,
  maximum: 100,
});
const listInput = s.actionInput(
  { ids, codes, offset, size },
  [],
  "The input payload for listing Kintone directory records.",
);
const raw = s.looseObject("The raw object returned by Kintone.");
const user = s.object("A normalized Kintone user.", {
  id: s.nullableString("The Kintone user ID."),
  code: s.nullableString("The Kintone user code."),
  name: s.nullableString("The Kintone user display name."),
  email: s.nullableString("The Kintone user email address."),
  valid: s.nullableBoolean("Whether the Kintone user status is active."),
  raw,
});
const department = s.object("A normalized Kintone department.", {
  id: s.nullableString("The Kintone department ID."),
  code: s.nullableString("The Kintone department code."),
  name: s.nullableString("The Kintone department name."),
  description: s.nullableString("The Kintone department description."),
  raw,
});
const group = s.object("A normalized Kintone group.", {
  id: s.nullableString("The Kintone group ID."),
  code: s.nullableString("The Kintone group code."),
  name: s.nullableString("The Kintone group name."),
  description: s.nullableString("The Kintone group description when returned."),
  raw,
});
const title = s.object("A normalized Kintone title.", {
  id: s.nullableString("The Kintone title ID."),
  code: s.nullableString("The Kintone title code."),
  name: s.nullableString("The Kintone title name."),
  description: s.nullableString("The Kintone title description."),
  raw,
});
const organizationTitle = s.object("A Kintone user's department and title assignment.", {
  organization: department,
  title: s.nullable(title),
  raw,
});
const userServices = s.object("A normalized Kintone user's service assignments.", {
  code: s.nullableString("The Kintone user code."),
  services: s.stringArray("The service codes assigned to the Kintone user."),
  raw,
});

function action(input: {
  name: string;
  operationType: ActionDefinition["operationType"];
  description: string;
  inputSchema: ReturnType<typeof s.actionInput>;
  outputSchema: ReturnType<typeof s.actionOutput>;
}): ActionDefinition {
  return defineProviderAction(service, {
    ...input,
    requiredScopes: [],
    providerPermissions: [],
  });
}

export const kintoneActions: ActionDefinition[] = [
  action({
    name: "list_users",
    operationType: "read",
    description: "List Kintone users with optional ID, code, and pagination filters.",
    inputSchema: listInput,
    outputSchema: s.actionOutput(
      { users: s.array("The users returned by Kintone.", user) },
      "The response returned when listing Kintone users.",
    ),
  }),
  action({
    name: "list_departments",
    operationType: "read",
    description: "List Kintone departments with optional ID, code, and pagination filters.",
    inputSchema: listInput,
    outputSchema: s.actionOutput(
      { departments: s.array("The departments returned by Kintone.", department) },
      "The response returned when listing Kintone departments.",
    ),
  }),
  action({
    name: "list_groups",
    operationType: "read",
    description: "List Kintone groups with optional ID, code, and pagination filters.",
    inputSchema: listInput,
    outputSchema: s.actionOutput(
      { groups: s.array("The groups returned by Kintone.", group) },
      "The response returned when listing Kintone groups.",
    ),
  }),
  action({
    name: "get_user_departments",
    operationType: "read",
    description: "Get the departments assigned to a Kintone user by user code.",
    inputSchema: s.actionInput({ code }, ["code"], "The input payload for querying a Kintone user's directory links."),
    outputSchema: s.actionOutput(
      { organizationTitles: s.array("The department and title assignments returned by Kintone.", organizationTitle) },
      "The response returned when getting a Kintone user's departments.",
    ),
  }),
  action({
    name: "get_user_groups",
    operationType: "read",
    description: "Get the groups assigned to a Kintone user by user code.",
    inputSchema: s.actionInput({ code }, ["code"], "The input payload for querying a Kintone user's directory links."),
    outputSchema: s.actionOutput(
      { groups: s.array("The groups assigned to the Kintone user.", group) },
      "The response returned when getting a Kintone user's groups.",
    ),
  }),
  action({
    name: "get_user_services",
    operationType: "read",
    description: "Get services assigned to Kintone users with optional user code filters.",
    inputSchema: s.actionInput(
      { codes, offset, size },
      [],
      "The input payload for querying Kintone user service assignments.",
    ),
    outputSchema: s.actionOutput(
      { users: s.array("The Kintone users and their assigned services.", userServices) },
      "The response returned when getting Kintone user service assignments.",
    ),
  }),
];
