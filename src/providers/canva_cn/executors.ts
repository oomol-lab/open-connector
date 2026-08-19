import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";

import { createCanvaCredentialValidators, createCanvaExecutors } from "../canva/executors.ts";

export const executors: ProviderExecutors = createCanvaExecutors("canva_cn", "https://api.canva.cn/rest");

export const credentialValidators: CredentialValidators = createCanvaCredentialValidators("https://api.canva.cn/rest");
