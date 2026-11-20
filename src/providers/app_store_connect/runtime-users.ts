import type { AppStoreConnectHandlers } from "./runtime-helpers.ts";

import { pickOptionalString } from "../../core/cast.ts";
import {
  getResource,
  listPage,
  readAppStoreConnectId,
  readCommaSeparatedList,
  resourcePath,
} from "./runtime-helpers.ts";

export const appStoreConnectUserHandlers: AppStoreConnectHandlers = {
  async list_users(input, context) {
    const page = await listPage(context, input, {
      path: "/v1/users",
      label: "App Store Connect user",
      query: {
        "filter[roles]": readCommaSeparatedList(input.roles),
        "filter[username]": pickOptionalString(input, "username"),
        "filter[visibleApps]": pickOptionalString(input, "visibleAppId"),
        "sort": pickOptionalString(input, "sort"),
      },
    });
    return { users: page.items, nextCursor: page.nextCursor, total: page.total };
  },

  async get_user(input, context) {
    return {
      user: await getResource(
        context,
        resourcePath("/v1/users", readAppStoreConnectId(input.userId, "userId")),
        "App Store Connect user",
      ),
    };
  },
};
