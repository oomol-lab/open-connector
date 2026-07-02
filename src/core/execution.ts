import type { ActionPolicyService } from "./action-policy.ts";
import type { ActionDefinition, ActionExecutor, ExecutionContext, ExecutionResult } from "./types.ts";

import { validateActionInput } from "./validation.ts";

/**
 * Validate input and run a local executor for an action.
 *
 * When `executor` is undefined, the action is treated as catalog-only and a
 * stable `executor_unavailable` error is returned.
 */
export async function executeAction(
  action: ActionDefinition,
  executor: ActionExecutor | undefined,
  input: unknown,
  context: ExecutionContext,
  policy?: ActionPolicyService,
): Promise<ExecutionResult> {
  const decision = policy?.evaluate(action);
  if (decision && !decision.allowed) {
    return {
      ok: false,
      error: {
        code: decision.code,
        message: decision.message,
      },
    };
  }

  if (!executor) {
    return {
      ok: false,
      error: {
        code: "executor_unavailable",
        message: "Execution for this action is not available in the local runtime yet.",
      },
    };
  }

  const validation = validateActionInput(action, input);
  if (!validation.valid) {
    return {
      ok: false,
      error: {
        code: "invalid_input",
        message: "Action input does not match the action schema.",
        details: validation.errors,
      },
    };
  }

  return executor(input, context);
}
