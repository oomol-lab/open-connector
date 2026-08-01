import type { ActionDefinition } from "./types.ts";
import type { OutputUnit, Schema } from "@cfworker/json-schema";

import { Validator } from "@cfworker/json-schema";

const validators = new WeakMap<ActionDefinition, Validator>();

/**
 * Result of validating an action input against its JSON Schema.
 */
export type ActionInputValidationResult = {
  valid: boolean;
  errors: OutputUnit[];
};

/**
 * Validate unknown user input against an action's declared input schema.
 */
export function validateActionInput(action: ActionDefinition, input: unknown): ActionInputValidationResult {
  const result = validatorFor(action).validate(input);

  return {
    valid: result.valid,
    errors: result.errors,
  };
}

function validatorFor(action: ActionDefinition): Validator {
  let validator = validators.get(action);
  if (validator === undefined) {
    // shortCircuit: false so one response lists every invalid property. Stopping
    // at the first keeps a caller fixing input one field per round trip.
    validator = new Validator(action.inputSchema as Schema, "2020-12", false);
    validators.set(action, validator);
  }

  return validator;
}
