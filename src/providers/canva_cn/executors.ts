import type { ProviderExecutors } from "../../core/types.ts";

import { createCanvaExecutors } from "../canva/executors.ts";

export const executors: ProviderExecutors = createCanvaExecutors("canva_cn", "https://api.canva.cn/rest");
