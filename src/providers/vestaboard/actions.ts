import type { ProviderActionDefinition } from "../../core/provider-definition.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "vestaboard";

const characterCodeSchema = s.nonNegativeInteger("One Vestaboard character code integer.");
const characterRowSchema = s.array("One row of Vestaboard character codes.", characterCodeSchema, { minItems: 1 });
const characterGridSchema = s.array("A two-dimensional array of Vestaboard character codes.", characterRowSchema, {
  minItems: 1,
});
const uuidSchema = s.uuid("The Vestaboard message identifier.");

const currentMessageSchema = s.object("The current message payload returned by Vestaboard.", {
  id: uuidSchema,
  layout: s.nonEmptyString("The raw Vestaboard layout JSON string returned by the Cloud API."),
  characters: {
    ...characterGridSchema,
    description: "The parsed Vestaboard character grid derived from the layout string.",
  },
  rows: s.positiveInteger("The number of rows in the parsed Vestaboard character grid."),
  columns: s.positiveInteger("The number of columns in the parsed Vestaboard character grid."),
});

const textMessageInputSchema = s.object(
  "Text-mode input for sending a Vestaboard message.",
  {
    text: s.nonEmptyString("The text message sent to Vestaboard."),
    forced: s.boolean("Whether Vestaboard should bypass quiet hours for this message."),
  },
  { optional: ["forced"] },
);

const charactersMessageInputSchema = s.object(
  "Character-grid input for sending a Vestaboard message.",
  {
    characters: {
      ...characterGridSchema,
      description: "The Vestaboard character grid to send.",
    },
    forced: s.boolean("Whether Vestaboard should bypass quiet hours for this message."),
  },
  { optional: ["forced"] },
);

const messageWriteResultSchema = s.object("The Vestaboard message write result.", {
  status: s.nonEmptyString("The write status returned by Vestaboard."),
  id: uuidSchema,
  created: s.nonNegativeInteger("The Unix epoch timestamp in milliseconds when Vestaboard created the message."),
});

const transitionSchema = s.stringEnum("The Vestaboard transition style.", ["classic", "wave", "drift", "curtain"]);
const transitionSpeedSchema = s.stringEnum("The Vestaboard transition speed.", ["gentle", "fast"]);
const transitionStateSchema = s.object("The Vestaboard transition settings.", {
  transition: transitionSchema,
  transitionSpeed: transitionSpeedSchema,
});

export type VestaboardActionName = "get_current_message" | "send_message" | "get_transition" | "set_transition";

export const vestaboardActions: ProviderActionDefinition<VestaboardActionName>[] = [
  defineProviderAction(service, {
    name: "get_current_message",
    description: "Read the current message displayed by Vestaboard Cloud API.",
    inputSchema: s.object("Input for reading the current Vestaboard message.", {}),
    outputSchema: s.object("The current message response returned by Vestaboard.", {
      currentMessage: {
        ...currentMessageSchema,
        description: "The current Vestaboard message returned by the Cloud API.",
      },
    }),
  }),
  defineProviderAction(service, {
    name: "send_message",
    description: "Send a new Vestaboard message as plain text or as a two-dimensional character-code grid.",
    inputSchema: s.oneOf([textMessageInputSchema, charactersMessageInputSchema], {
      description: "Input for sending a Vestaboard message.",
    }),
    outputSchema: messageWriteResultSchema,
  }),
  defineProviderAction(service, {
    name: "get_transition",
    description: "Read the current Vestaboard transition settings.",
    inputSchema: s.object("Input for reading Vestaboard transition settings.", {}),
    outputSchema: transitionStateSchema,
  }),
  defineProviderAction(service, {
    name: "set_transition",
    description: "Update the Vestaboard transition style and transition speed.",
    inputSchema: {
      ...transitionStateSchema,
      description: "Input for updating Vestaboard transition settings.",
    },
    outputSchema: transitionStateSchema,
  }),
];
