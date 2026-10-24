import type { ProviderActionHandlers } from "../provider-executors.ts";
import type { KarakeepHandler } from "./runtime-helpers.ts";

import { combineProviderActionHandlers } from "../provider-executors.ts";
import { karakeepAdminActionHandlers } from "./runtime-admin.ts";
import { karakeepAssetActionHandlers } from "./runtime-assets.ts";
import { karakeepBackupActionHandlers } from "./runtime-backups.ts";
import { karakeepBookmarkActionHandlers } from "./runtime-bookmarks.ts";
import { karakeepFeedActionHandlers } from "./runtime-feeds.ts";
import { karakeepHighlightActionHandlers } from "./runtime-highlights.ts";
import { karakeepListActionHandlers } from "./runtime-lists.ts";
import { karakeepTagActionHandlers } from "./runtime-tags.ts";
import { karakeepUserActionHandlers } from "./runtime-users.ts";

export const karakeepActionHandlers: ProviderActionHandlers<"karakeep", KarakeepHandler> =
  combineProviderActionHandlers(
    "karakeep",
    karakeepUserActionHandlers,
    karakeepBookmarkActionHandlers,
    karakeepListActionHandlers,
    karakeepTagActionHandlers,
    karakeepHighlightActionHandlers,
    karakeepAssetActionHandlers,
    karakeepBackupActionHandlers,
    karakeepFeedActionHandlers,
    karakeepAdminActionHandlers,
  );
