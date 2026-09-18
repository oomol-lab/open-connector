import type { ProviderActionDefinition } from "../../core/provider-definition.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";
import { service } from "./schemas.ts";
import {
  nonEmptyString,
  pageOutput,
  paginationInputs,
  teamRoles,
  userResource,
  usersAndAccessRoles,
} from "./schemas.ts";

export const appStoreConnectUserActions: readonly ProviderActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_users",
    operationType: "read",
    description: "List the members of the App Store Connect team, with the roles granted to each of them.",
    requiredScopes: [],
    providerPermissions: [...usersAndAccessRoles],
    inputSchema: s.object(
      "Filters for browsing team members.",
      {
        roles: s.array(
          "Return only users holding at least one of these roles.",
          s.stringEnum("An App Store Connect team role.", teamRoles),
          { minItems: 1 },
        ),
        username: nonEmptyString("Return only the user with this exact Apple Account email."),
        visibleAppId: nonEmptyString("Return only users who can see this app."),
        sort: s.stringEnum("Sort order for the returned users.", ["username", "-username", "lastName", "-lastName"]),
        ...paginationInputs,
      },
      { optional: ["roles", "username", "visibleAppId", "sort", "limit", "cursor"] },
    ),
    outputSchema: pageOutput(
      "users",
      userResource,
      "Team members returned for this page.",
      "A page of App Store Connect team members.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_user",
    operationType: "read",
    description: "Read one App Store Connect team member by identifier.",
    requiredScopes: [],
    providerPermissions: [...usersAndAccessRoles],
    inputSchema: s.actionInput(
      { userId: nonEmptyString("App Store Connect identifier of the team member.") },
      ["userId"],
      "Identifies the team member to read.",
    ),
    outputSchema: s.actionOutput({ user: userResource }, "The requested team member."),
  }),
];
