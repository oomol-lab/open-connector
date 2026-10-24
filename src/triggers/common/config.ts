import type { Group, InputPort, JsonValue } from "./types.ts";
import type { Schema } from "@cfworker/json-schema";

import { Validator } from "@cfworker/json-schema";
import { ExecutionError } from "../../core/execution-error.ts";
export function resolveTriggerConfig(
  inputs: readonly (InputPort | Group)[],
  config: Readonly<Record<string, JsonValue>>,
  partial = false,
): Readonly<Record<string, JsonValue>> {
  const fields = inputs.filter((input): input is InputPort => "handle" in input);
  const known = new Set(fields.map((field) => field.handle));
  if (Object.keys(config).some((key) => !known.has(key)))
    throw new ExecutionError("invalid_input", "Unknown Trigger configuration field.", "invalid_input");
  return Object.fromEntries(
    fields
      .filter((field) => !partial || config[field.handle] !== undefined || field.value !== undefined)
      .map((field) => {
        const value = config[field.handle] !== undefined ? config[field.handle]! : (field.value ?? null);
        if (
          !(value === null && field.nullable) &&
          !new Validator(field.jsonSchema as Schema, "2020-12").validate(value).valid
        )
          throw new ExecutionError("invalid_input", `Invalid Trigger configuration: ${field.handle}`, "invalid_input");
        return [field.handle, value];
      }),
  );
}
