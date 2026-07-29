import type { ProviderActionDefinition } from "../../core/provider-definition.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "triggercmd";

export type TriggercmdActionName = "list_commands" | "trigger_command";

const computerSchema = s.looseRequiredObject(
  "The computer that owns a TRIGGERcmd command.",
  {
    name: s.nonEmptyString("The configured computer name."),
    id: s.string("The computer identifier."),
  },
  { optional: ["id"] },
);

const commandSchema = s.looseRequiredObject(
  "A command configured in the connected TRIGGERcmd account.",
  {
    name: s.nonEmptyString("The configured command name."),
    computer: computerSchema,
    voice: s.string("The voice trigger phrase for the command."),
    allowParams: s.boolean("Whether the command accepts caller-provided parameters."),
    mcpToolDescription: s.string("The optional MCP tool description configured for the command."),
  },
  { optional: ["voice", "allowParams", "mcpToolDescription"] },
);

export const triggercmdActions: ProviderActionDefinition<TriggercmdActionName>[] = [
  defineProviderAction(service, {
    name: "list_commands",
    description:
      "List the commands available in the connected TRIGGERcmd account and the computer that owns each command.",
    requiredScopes: [],
    inputSchema: s.object("No input parameters are required.", {}),
    outputSchema: s.looseRequiredObject(
      "The commands returned by TRIGGERcmd.",
      {
        records: s.array("The configured TRIGGERcmd commands.", commandSchema),
        queryRecordCount: s.integer("The number of command records returned.", {
          minimum: 0,
        }),
      },
      { optional: ["queryRecordCount"] },
    ),
  }),
  defineProviderAction(service, {
    name: "trigger_command",
    description:
      "Trigger a saved TRIGGERcmd command on a named computer, with optional parameters when that command permits them.",
    requiredScopes: [],
    inputSchema: s.object(
      "The TRIGGERcmd command to run.",
      {
        computer: s.nonEmptyString("The target computer name exactly as returned by list_commands."),
        trigger: s.nonEmptyString("The saved command name exactly as returned by list_commands."),
        params: s.string("Optional parameters for a saved command that has parameter support enabled."),
      },
      { optional: ["params"] },
    ),
    outputSchema: s.looseRequiredObject(
      "The TRIGGERcmd command acknowledgement.",
      {
        message: s.nonEmptyString("The acknowledgement or command result returned by TRIGGERcmd."),
      },
      { optional: ["message"] },
    ),
  }),
];
