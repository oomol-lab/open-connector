import type { ActionDefinition } from "../../core/types.ts";

import { createFeishuProviderActions } from "../feishu/actions.ts";

/** Lark exposes exactly the Feishu action set, under `lark.<name>` ids. */
export const larkActions: ActionDefinition[] = createFeishuProviderActions("lark");
