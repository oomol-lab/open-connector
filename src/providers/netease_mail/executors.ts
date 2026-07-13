import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";

import { createMailProviderRuntime } from "../../mail/imap-smtp/runtime.ts";
import { neteaseMailRuntimeConfig } from "./config.ts";

const runtime = createMailProviderRuntime(neteaseMailRuntimeConfig);

export const executors: ProviderExecutors = runtime.executors;
export const credentialValidators: CredentialValidators = runtime.credentialValidators;
