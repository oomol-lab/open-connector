import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";

import { createCanvaCredentialValidators, createCanvaExecutors } from "../canva/executors.ts";

const canvaCnApiBaseUrl = "https://api.canva.cn/rest";

export const executors: ProviderExecutors = createCanvaExecutors("canva_cn", canvaCnApiBaseUrl);

export const credentialValidators: CredentialValidators = createCanvaCredentialValidators(canvaCnApiBaseUrl);
