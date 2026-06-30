import type { CredentialValidators, ProviderExecutors } from "../core/types.ts";

/** Lazy-loaded provider executor module shape. */
export type ExecutorModule = {
  credentialValidators?: CredentialValidators;
  executors: ProviderExecutors;
};

/** Generated lazy imports for provider executors. Do not hand-edit. */
export const executorModules: Record<string, () => Promise<ExecutorModule>> = {
  github: (): Promise<ExecutorModule> => import("./github/executors.ts"),
  gmail: (): Promise<ExecutorModule> => import("./gmail/executors.ts"),
  hackernews: (): Promise<ExecutorModule> => import("./hackernews/executors.ts"),
  notion: (): Promise<ExecutorModule> => import("./notion/executors.ts"),
};
