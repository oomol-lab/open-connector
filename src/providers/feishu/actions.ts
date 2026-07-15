import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "feishu";

const feishuUserSchema = s.object("The authenticated Feishu user profile.", {
  openId: s.nullable(s.string("The open_id of the authorized user, scoped to this OAuth app.")),
  unionId: s.nullable(s.string("The union_id of the authorized user, scoped to the developer account.")),
  userId: s.nullable(s.string("The tenant-scoped user_id of the authorized user.")),
  name: s.nullable(s.string("The display name of the authorized user.")),
  enName: s.nullable(s.string("The English name of the authorized user.")),
  email: s.nullable(s.string("The email of the authorized user, when the user granted it.")),
  avatarUrl: s.nullable(s.string("The avatar URL of the authorized user.")),
  tenantKey: s.nullable(s.string("The tenant key the authorized user belongs to.")),
  raw: s.looseObject("The raw user_info object returned by Feishu."),
});

/**
 * Feishu actions backed by the user_access_token (the authorized user's own
 * identity and resources). Document and Bitable read actions are added in
 * follow-up work; this initial set proves the user OAuth flow end to end.
 */
export const feishuActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_current_user",
    description: "Get the profile of the Feishu user who authorized this connection, using their user_access_token.",
    inputSchema: s.object("No input is required.", {}),
    outputSchema: feishuUserSchema,
  }),
];

export type FeishuActionName = "get_current_user";
