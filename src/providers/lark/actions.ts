import { createFeishuBaseActions } from "../feishu/shared/base-actions.ts";
import { createFeishuCalendarActions } from "../feishu/shared/calendar-actions.ts";
import { createFeishuDocsActions } from "../feishu/shared/docs-actions.ts";
import { createFeishuDriveActions } from "../feishu/shared/drive-actions.ts";
import { createFeishuTaskActions } from "../feishu/shared/task-actions.ts";
import { createFeishuWikiActions } from "../feishu/shared/wiki-actions.ts";

// These shared Open Platform contracts use user OAuth, never a messaging bot's token.
export const larkActions: ActionDefinition[] = [
  ...createFeishuDocsActions("lark"),
  ...createFeishuDriveActions("lark"),
  ...createFeishuWikiActions("lark"),
  ...createFeishuBaseActions("lark"),
  ...createFeishuCalendarActions("lark"),
  ...createFeishuTaskActions("lark"),
].map((action) => ({ ...action, description: action.description.replaceAll("Feishu", "Lark") }));
import type { ActionDefinition } from "../../core/types.ts";
