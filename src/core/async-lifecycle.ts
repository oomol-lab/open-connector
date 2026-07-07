import type { ActionDefinition } from "./types.ts";

/**
 * An asyncLifecycle block with a complete job-id and completion-detection mapping,
 * making it eligible for the runtime's bounded auto-poll ("await") behavior.
 */
export interface PollableAsyncLifecycle {
  startActionId: string;
  statusActionId: string;
  cancelActionId?: string;
  jobIdOutputPath: string;
  jobIdInputField: string;
  completionPath: string;
  completionValues: { done: unknown[]; failed?: unknown[] };
}

/**
 * Check whether an action's asyncLifecycle metadata carries the full field
 * mapping required to auto-poll it, rather than just the start/status/cancel
 * action ids.
 */
export function isPollableAsyncLifecycle(
  asyncLifecycle: ActionDefinition["asyncLifecycle"],
): asyncLifecycle is PollableAsyncLifecycle {
  return Boolean(
    asyncLifecycle?.jobIdOutputPath &&
    asyncLifecycle.jobIdInputField &&
    asyncLifecycle.completionPath &&
    asyncLifecycle.completionValues &&
    asyncLifecycle.completionValues.done.length > 0,
  );
}
