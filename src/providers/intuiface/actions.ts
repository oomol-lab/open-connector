import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "intuiface";

function stringFilterList(description: string, itemDescription: string): JsonSchema {
  return s.stringArray(description, { itemDescription });
}

const filterFields = {
  experienceNames: stringFilterList(
    "Experience names that must exactly match running Intuiface experiences.",
    "An exact Intuiface experience name.",
  ),
  experienceIDs: stringFilterList(
    "Experience IDs that must exactly match running Intuiface experiences.",
    "An exact Intuiface experience ID.",
  ),
  playerDeviceNames: stringFilterList(
    "Player device names that must exactly match Players running the experiences.",
    "An exact Intuiface Player device name.",
  ),
  playerIDs: stringFilterList(
    "Player IDs that must exactly match Players running the experiences.",
    "An exact Intuiface Player ID.",
  ),
  playerTags: stringFilterList(
    "Player tags used to select Players with one or more matching tags.",
    "An exact Intuiface Player tag.",
  ),
};

const optionalFilterFields = ["experienceNames", "experienceIDs", "playerDeviceNames", "playerIDs", "playerTags"];

const playerSchema = s.looseObject("The Intuiface Player running an experience.", {
  playerId: s.string("The Player device ID."),
  name: s.string("The Player device name."),
  nickName: s.string("The Player device nickname."),
  platform: s.string("The Player platform."),
  version: s.string("The Intuiface Player version."),
  tags: s.stringArray("The tags assigned to the Player.", {
    itemDescription: "An Intuiface Player tag.",
  }),
});

const experienceSchema = s.looseObject("A running Intuiface experience.", {
  id: s.string("The experience ID."),
  name: s.string("The experience name."),
  runningOnPlayer: playerSchema,
});

const experienceCollectionFields = {
  experienceCount: s.nonNegativeInteger("The number of experiences in the result."),
  experiences: s.array("The matching running experiences.", experienceSchema),
  timestamp: s.string("The UTC timestamp reported by Intuiface."),
};

export const intuifaceActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_available_experiences",
    operationType: "read",
    description: "List running Intuiface experiences that can receive Web Trigger messages.",
    inputSchema: s.object(
      "Filters for listing available Intuiface experiences. All provided filters use AND semantics.",
      filterFields,
      { optional: optionalFilterFields },
    ),
    outputSchema: s.looseObject("The available Intuiface experiences response.", {
      status: s.stringEnum("The Intuiface experience search status.", [
        "connectedExperiences",
        "noConnectedExperience",
        "noMatchingExperience",
      ]),
      ...experienceCollectionFields,
    }),
  }),
  defineProviderAction(service, {
    name: "send_message",
    operationType: "write",
    description: "Send a Web Trigger message to selected running Intuiface experiences.",
    inputSchema: s.object(
      "The message and optional filters for selecting target Intuiface experiences.",
      {
        message: s.string("The message value sent to every selected experience."),
        parameter1: s.string("The first optional value sent with the message."),
        parameter2: s.string("The second optional value sent with the message."),
        parameter3: s.string("The third optional value sent with the message."),
        ...filterFields,
      },
      {
        optional: ["parameter1", "parameter2", "parameter3", ...optionalFilterFields],
      },
    ),
    outputSchema: s.looseObject("The Intuiface Web Trigger message delivery response.", {
      status: s.stringEnum("The Intuiface message delivery status.", [
        "sent",
        "noConnectedExperience",
        "noMatchingExperience",
      ]),
      ...experienceCollectionFields,
    }),
  }),
];
