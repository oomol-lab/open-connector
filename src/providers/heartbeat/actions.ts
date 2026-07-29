import type { ProviderActionDefinition } from "../../core/provider-definition.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "heartbeat";

const userGroupSchema = s.looseObject("A Heartbeat group associated with a user.", {
  id: s.string("The unique identifier of the group."),
  name: s.string("The display name of the group."),
});

const onboardingResponseSchema = s.looseObject("One response to a Heartbeat onboarding question.", {
  question: s.string("The onboarding question shown to the user."),
  answer: s.string("The user's answer to the onboarding question."),
  isPrivate: s.boolean("Whether the onboarding response is private."),
});

const userSchema = s.looseObject(
  "A Heartbeat community user with documented profile fields and any additional upstream data.",
  {
    id: s.string("The unique identifier of the user."),
    email: s.email("The user's email address."),
    name: s.string("The user's full name."),
    firstName: s.string("The user's first name."),
    lastName: s.string("The user's last name."),
    role: s.string("The user's current role."),
    isAdmin: s.boolean("Whether the user is a community administrator."),
    groups: s.array("The groups associated with the user.", userGroupSchema),
    onboardingResponses: s.array("The user's onboarding question responses.", onboardingResponseSchema),
    bio: s.string("The user's Heartbeat biography."),
    avatar: s.string("The URL of the user's Heartbeat avatar."),
    linkedInSummary: s.string("The formatted LinkedIn summary available for the user."),
    linkedInData: s.nullable(s.looseObject("The LinkedIn profile data available for the user.")),
  },
);

const groupUserSchema = s.looseObject("A Heartbeat user included in a group.", {
  id: s.string("The unique identifier of the user."),
  name: s.string("The display name of the user."),
  email: s.email("The email address of the user."),
});

const groupSchema = s.looseObject("A Heartbeat access group with documented fields and any additional upstream data.", {
  id: s.string("The unique identifier of the group."),
  name: s.string("The display name of the group."),
  description: s.string("The description of the group."),
  color: s.string("The hexadecimal color assigned to the group."),
  parentGroupID: s.nullable(s.string("The identifier of the parent group, or null for a top-level group.")),
  users: s.array("The users who belong to the group.", groupUserSchema),
  archived: s.boolean("Whether the group is archived."),
});

const channelSchema = s.looseObject("A Heartbeat channel with documented fields and any additional upstream data.", {
  id: s.string("The unique identifier of the channel."),
  name: s.string("The display name of the channel."),
  emoji: s.string("The emoji assigned to the channel."),
  type: s.stringEnum("The Heartbeat channel type.", ["POSTS", "CHAT", "VOICE"]),
});

const eventSchema = s.looseObject(
  "A Heartbeat community event with documented fields and any additional upstream data.",
  {
    id: s.string("The unique identifier of the event."),
    name: s.string("The display name of the event."),
    description: s.string("The description of the event."),
    startTime: s.dateTime("The original event start time in UTC."),
    endTime: s.dateTime("The original event end time in UTC."),
    recurring: s.boolean("Whether the event recurs."),
    createdAt: s.dateTime("The time when the event was created."),
    createdBy: s.string("The user identifier of the event creator."),
    invitedUsers: s.array("The identifiers of users invited to the event.", s.string("An invited user identifier.")),
    invitedGroups: s.array("The identifiers of groups invited to the event.", s.string("An invited group identifier.")),
    coverImage: s.nullable(s.string("The URL of the event cover image, or null when no cover image is set.")),
  },
);

export const heartbeatActions: ProviderActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_users",
    description: "List all users in the connected Heartbeat community.",
    inputSchema: s.actionInput({}, [], "No input is required to list Heartbeat users."),
    outputSchema: s.actionOutput({
      users: s.array("The community users.", userSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "get_user",
    description: "Retrieve one Heartbeat community user by user ID.",
    inputSchema: s.actionInput(
      {
        userId: s.uuid("The unique Heartbeat user ID."),
      },
      ["userId"],
      "The Heartbeat user to retrieve.",
    ),
    outputSchema: s.actionOutput({
      user: userSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "find_users_by_email",
    description: "Find Heartbeat community users whose email matches exactly.",
    inputSchema: s.actionInput(
      {
        email: s.email("The exact user email address to find."),
      },
      ["email"],
      "The email address to find in the Heartbeat community.",
    ),
    outputSchema: s.actionOutput({
      users: s.array("The matching community users.", userSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "list_groups",
    description: "List all access groups in the connected Heartbeat community.",
    inputSchema: s.actionInput({}, [], "No input is required to list Heartbeat groups."),
    outputSchema: s.actionOutput({
      groups: s.array("The community access groups.", groupSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "get_group",
    description: "Retrieve one Heartbeat access group by group ID.",
    inputSchema: s.actionInput(
      {
        groupId: s.uuid("The unique Heartbeat group ID."),
      },
      ["groupId"],
      "The Heartbeat group to retrieve.",
    ),
    outputSchema: s.actionOutput({
      group: groupSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_channels",
    description: "List all channels in the connected Heartbeat community.",
    inputSchema: s.actionInput({}, [], "No input is required to list Heartbeat channels."),
    outputSchema: s.actionOutput({
      channels: s.array("The community channels.", channelSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "list_events",
    description: "List Heartbeat community events, optionally filtered by access group.",
    inputSchema: s.object(
      "The optional group filter for Heartbeat events.",
      {
        groupId: s.uuid("Return only events assigned to this Heartbeat group ID."),
      },
      { optional: ["groupId"] },
    ),
    outputSchema: s.actionOutput({
      events: s.array("The community events.", eventSchema),
    }),
  }),
];
