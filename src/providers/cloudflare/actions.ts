import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";
import { actions as browserRenderingActions } from "./browser-rendering/actions.ts";
import { actions as dnsActions } from "./dns/actions.ts";
import { actions as emailRoutingActions } from "./email-routing/actions.ts";
import { actions as kvActions } from "./kv/actions.ts";
import { actions as pagesActions } from "./pages/actions.ts";
import { actions as r2Actions } from "./r2/actions.ts";
import { actions as workersActions } from "./workers/actions.ts";

export const actions: ActionDefinition[] = [
  defineProviderAction("cloudflare", {
    name: "list_accounts",
    operationType: "read",
    description: "List accessible Cloudflare accounts and pagination metadata.",
    inputSchema: s.object(
      "Account pagination.",
      { page: s.positiveInteger("Page number."), perPage: s.positiveInteger("Accounts per page.") },
      { optional: ["page", "perPage"] },
    ),
    outputSchema: s.object(
      "Accessible accounts.",
      {
        accounts: s.array(
          "Accounts on this page.",
          s.looseObject("One account.", {
            id: s.string("Account ID."),
            name: s.string("Account name."),
            type: s.string("Account type."),
          }),
        ),
        resultInfo: s.looseObject("Pagination metadata."),
      },
      { optional: ["resultInfo"] },
    ),
  }),
  ...dnsActions,
  ...workersActions,
  ...r2Actions,
  ...emailRoutingActions,
  ...browserRenderingActions,
  ...kvActions,
  ...pagesActions,
];
