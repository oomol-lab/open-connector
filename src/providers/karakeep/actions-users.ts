import type { ActionDefinition } from "../../core/types.ts";

import { defineProviderAction } from "../../core/provider-definition.ts";
import { currentUserSchema, emptyInputSchema, userStatsSchema } from "./schemas.ts";

const service = "karakeep";
const userReadScopes = ["users:read"] as const;

export const karakeepUserActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_current_user",
    operationType: "read",
    description:
      "Get the profile of the Karakeep user that owns the connected API key, including name, email and avatar.",
    requiredScopes: userReadScopes,
    inputSchema: emptyInputSchema,
    outputSchema: currentUserSchema,
  }),
  defineProviderAction(service, {
    name: "get_current_user_stats",
    operationType: "read",
    description:
      "Get usage statistics for the Karakeep user that owns the connected API key, including bookmark, tag, list and asset counts.",
    requiredScopes: userReadScopes,
    inputSchema: emptyInputSchema,
    outputSchema: userStatsSchema,
  }),
];
