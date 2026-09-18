import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "calendly";

const calendlyUri = (resource: string, description: string): JsonSchema =>
  s.stringPattern(`^https://api\\.calendly\\.com/${resource}/[^/]+(?:/.*)?$`, {
    description,
  });

const userUri = calendlyUri("users", "The Calendly user URI returned by the API.");
const organizationUri = calendlyUri("organizations", "The Calendly organization URI returned by the API.");
const organizationMembershipUri = calendlyUri(
  "organization_memberships",
  "The Calendly organization membership URI returned by the API.",
);
const eventTypeUri = calendlyUri("event_types", "The Calendly event type URI returned by the API.");
const scheduledEventUri = calendlyUri("scheduled_events", "The Calendly scheduled event URI returned by the API.");
const availabilityScheduleUri = calendlyUri(
  "user_availability_schedules",
  "The Calendly user availability schedule URI returned by the API.",
);
const webhookSubscriptionUri = calendlyUri(
  "webhook_subscriptions",
  "The Calendly webhook subscription URI returned by the API.",
);
const inviteeNoShowUri = calendlyUri("invitee_no_shows", "The Calendly invitee no-show URI returned by the API.");
const routingFormUri = calendlyUri("routing_forms", "The Calendly routing form URI returned by the API.");
const routingFormSubmissionUri = calendlyUri(
  "routing_form_submissions",
  "The Calendly routing form submission URI returned by the API.",
);
const inviteeUri = s.stringPattern("^https://api\\.calendly\\.com/scheduled_events/[^/]+/invitees/[^/]+$", {
  description: "The Calendly invitee URI returned by the API.",
});
const organizationInvitationUri = s.stringPattern(
  "^https://api\\.calendly\\.com/organizations/[^/]+/invitations/[^/]+$",
  {
    description: "The Calendly organization invitation URI returned by the API.",
  },
);

const count = s.integer({
  minimum: 1,
  maximum: 100,
  description: "The number of records to return per page.",
});
const pageToken = s.nonEmptyString("The pagination cursor returned by a previous page.");
const sort = s.nonEmptyString("The sort expression accepted by Calendly.");
const isoDateTime = (description: string): JsonSchema => s.dateTime(description);
const raw = (description: string): JsonSchema => s.looseObject({}, { description });
const rawArray = (description: string, itemDescription: string): JsonSchema =>
  s.array(raw(itemDescription), { description });

const pagination = s.requiredObject("Pagination metadata returned by Calendly list endpoints.", {
  count: s.integer({ description: "The number of items returned in the current page." }),
  nextPage: s.nullableString("The URL for the next page, or null when there is no next page."),
  nextPageToken: s.nullableString("The cursor token for the next page, or null when there is no next page."),
  previousPage: s.nullableString("The URL for the previous page, or null when there is no previous page."),
  previousPageToken: s.nullableString(
    "The cursor token for the previous page, or null when there is no previous page.",
  ),
});
const officialPagination = s.requiredObject("Official pagination metadata returned by Calendly list endpoints.", {
  count: s.integer({ description: "The number of items returned in the current page." }),
  next_page: s.nullableString("The URL for the next page, or null when there is no next page."),
  next_page_token: s.nullableString("The cursor token for the next page, or null when there is no next page."),
  previous_page: s.nullableString("The URL for the previous page, or null when there is no previous page."),
  previous_page_token: s.nullableString(
    "The cursor token for the previous page, or null when there is no previous page.",
  ),
});

const inviteeInput = s.requiredObject("The primary invitee profile used to create one Calendly booking.", {
  name: s.nonEmptyString("The full name of the primary invitee to book."),
  firstName: s.nonEmptyString("The invitee first name to submit with the booking."),
  lastName: s.nonEmptyString("The invitee last name to submit with the booking."),
  email: s.email("The email address of the primary invitee to book."),
  timezone: s.nonEmptyString("The IANA timezone of the primary invitee."),
  textReminderNumber: s.nonEmptyString(
    "The E.164 phone number to use for invitee text reminders when Calendly supports them.",
  ),
});
const questionAndAnswerInput = s.requiredObject("One custom question answer to submit when creating the booking.", {
  question: s.nonEmptyString("The custom question label to answer when creating the booking."),
  answer: s.nonEmptyString("The answer to submit for the custom question."),
  position: s.integer({ minimum: 0, description: "The zero-based custom-question position expected by Calendly." }),
});
const shareLocationConfiguration = s.requiredObject("One location configuration to apply to the share.", {
  location: s.nonEmptyString("The textual location value configured on the share."),
  additionalInfo: s.nonEmptyString("Additional instructions configured on the share location."),
  phoneNumber: s.nonEmptyString("The phone number configured on the share location."),
  position: s.integer({ minimum: 0, description: "The display position of the share location." }),
  kind: s.nonEmptyString("The share location kind."),
});
const availabilityRule = s.looseObject({}, { description: "A Calendly availability rule object." });
const availabilityRuleInput = s.requiredObject("The availability override to apply.", {
  rules: s.array(availabilityRule, { description: "The availability rules to apply." }),
  timezone: s.nonEmptyString("The timezone of the availability override."),
  user: userUri,
});
const tracking = raw("The tracking payload to associate with the booking.");
const locationInput = raw("The location payload to submit with the booking when Calendly requires it.");
const webhookEvent = s.stringEnum(["invitee.created", "invitee.canceled", "routing_form_submission.created"], {
  description: "One Calendly webhook event value supported by this connector.",
});

export type CalendlyActionName =
  | "get_current_user"
  | "get_user"
  | "get_organization"
  | "list_organization_memberships"
  | "get_organization_membership"
  | "delete_organization_membership"
  | "list_organization_invitations"
  | "create_organization_invitation"
  | "revoke_organization_invitation"
  | "list_event_types"
  | "get_event_type"
  | "create_single_use_scheduling_link"
  | "create_share"
  | "create_event_invitee"
  | "list_event_type_available_times"
  | "list_event_type_availability_schedules"
  | "update_event_type_availability_schedule"
  | "list_scheduled_events"
  | "get_scheduled_event"
  | "cancel_scheduled_event"
  | "list_event_invitees"
  | "get_event_invitee"
  | "create_invitee_no_show"
  | "get_invitee_no_show"
  | "delete_invitee_no_show"
  | "list_routing_forms"
  | "get_routing_form"
  | "list_routing_form_submissions"
  | "get_routing_form_submission"
  | "list_user_meeting_locations"
  | "create_webhook_subscription"
  | "list_webhook_subscriptions"
  | "get_webhook_subscription"
  | "delete_webhook_subscription"
  | "list_user_availability_schedules"
  | "get_user_availability_schedule"
  | "list_user_busy_times";

export const calendlyProviderScopes: string[] = [
  "availability:write",
  "event_types:read",
  "locations:read",
  "routing_forms:read",
  "shares:write",
  "scheduled_events:write",
  "scheduling_links:write",
  "organizations:write",
  "users:read",
  "webhooks:write",
];

export const calendlyActions: ActionDefinition[] = [
  action(
    "get_current_user",
    "read",
    "Retrieve the authenticated Calendly user for the connected credential.",
    s.actionInput({}, [], "The input payload for retrieving the authenticated Calendly user."),
    s.actionOutput(
      { currentUser: raw("A Calendly user resource.") },
      "The response wrapper for the authenticated Calendly user.",
    ),
    ["users:read"],
  ),
  action(
    "get_user",
    "read",
    "Retrieve one Calendly user by user URI.",
    input({ userUri }, ["userUri"]),
    resourceOutput("user", "A Calendly user resource."),
    ["users:read"],
  ),
  action(
    "get_organization",
    "read",
    "Retrieve one Calendly organization by organization URI.",
    input({ organizationUri }, ["organizationUri"]),
    resourceOutput("organization", "A Calendly organization resource."),
    ["organizations:write"],
  ),
  action(
    "list_organization_memberships",
    "read",
    "List Calendly organization memberships for one organization or one user.",
    input({
      organizationUri,
      userUri,
      email: s.email("The email filter applied to organization memberships."),
      count,
      pageToken,
    }),
    listOutput("organizationMemberships", "The organization memberships returned by Calendly."),
    ["organizations:write"],
  ),
  action(
    "get_organization_membership",
    "read",
    "Retrieve one Calendly organization membership by membership URI.",
    input({ organizationMembershipUri }, ["organizationMembershipUri"]),
    resourceOutput("organizationMembership", "A Calendly organization membership resource."),
    ["organizations:write"],
  ),
  action(
    "delete_organization_membership",
    "destructive",
    "Delete one Calendly organization membership by membership URI.",
    input({ organizationMembershipUri }, ["organizationMembershipUri"]),
    booleanOutput("deleted", "The response wrapper for deleting one Calendly organization membership."),
    ["organizations:write"],
  ),
  action(
    "list_organization_invitations",
    "read",
    "List organization invitations for one Calendly organization.",
    input(
      {
        organizationUri,
        email: s.email("The email filter applied to organization invitations."),
        status: s.stringEnum(["pending", "accepted", "declined"], {
          description: "The invitation status filter accepted by Calendly.",
        }),
        count,
        pageToken,
        sort,
      },
      ["organizationUri"],
    ),
    listOutput("organizationInvitations", "The organization invitations returned by Calendly."),
    ["organizations:write"],
  ),
  action(
    "create_organization_invitation",
    "write",
    "Create one organization invitation for a Calendly organization.",
    input(
      {
        organizationUri,
        email: s.email("The email address to invite to the organization."),
      },
      ["organizationUri", "email"],
    ),
    resourceOutput("organizationInvitation", "A Calendly organization invitation resource."),
    ["organizations:write"],
  ),
  action(
    "revoke_organization_invitation",
    "destructive",
    "Revoke one organization invitation from a Calendly organization.",
    input({ organizationUri, organizationInvitationUri }, ["organizationUri", "organizationInvitationUri"]),
    booleanOutput("revoked", "The response wrapper for revoking one Calendly organization invitation."),
    ["organizations:write"],
  ),
  action(
    "list_event_types",
    "read",
    "List Calendly event types for exactly one user or one organization, including scheduling URLs.",
    input({
      userUri,
      organizationUri,
      count,
      pageToken,
      sort,
      active: s.boolean({ description: "Whether to filter event types by active state." }),
      adminManaged: s.boolean({ description: "Whether to filter event types by admin-managed status." }),
      userAvailabilityScheduleUri: availabilityScheduleUri,
    }),
    listOutput("eventTypes", "The event types returned by Calendly."),
    ["event_types:read"],
  ),
  action(
    "get_event_type",
    "read",
    "Retrieve one Calendly event type by event type URI.",
    input({ eventTypeUri }, ["eventTypeUri"]),
    resourceOutput("eventType", "A Calendly event type resource."),
    ["event_types:read"],
  ),
  action(
    "create_single_use_scheduling_link",
    "write",
    "Create one single-use scheduling link from an existing Calendly event type without customization.",
    input({ eventTypeUri }, ["eventTypeUri"]),
    resourceOutput("schedulingLink", "A Calendly single-use scheduling link resource."),
    ["scheduling_links:write"],
  ),
  action(
    "create_share",
    "write",
    "Create one customized single-use share from an existing Calendly event type.",
    input(
      {
        eventTypeUri,
        name: s.nonEmptyString("The custom display name to use for the share."),
        duration: s.integer({
          minimum: 1,
          maximum: 720,
          description: "The custom meeting duration to use for the share.",
        }),
        durationOptions: s.array(
          s.integer({ minimum: 1, maximum: 720, description: "One allowed duration option to expose on the share." }),
          {
            maxItems: 4,
            description: "The allowed duration options to expose on the share.",
          },
        ),
        periodType: s.stringEnum(["available_moving", "moving", "fixed", "unlimited"], {
          description: "The booking window type to apply to the share.",
        }),
        startDate: s.date("The first bookable date."),
        endDate: s.date("The last bookable date."),
        maxBookingTime: s.integer({ minimum: 1, description: "The maximum booking window to apply to the share." }),
        hideLocation: s.boolean({ description: "Whether the share hides the location until booking time." }),
        locationConfigurations: s.array(shareLocationConfiguration, {
          description: "The location configurations to apply to the share.",
        }),
        availabilityRule: availabilityRuleInput,
      },
      ["eventTypeUri"],
    ),
    resourceOutput("share", "The share resource returned by Calendly."),
    ["shares:write"],
  ),
  action(
    "create_event_invitee",
    "write",
    "Create one Calendly invitee booking for a confirmed available start time.",
    input(
      {
        eventTypeUri,
        startTime: isoDateTime("The scheduled start time to book in ISO 8601 format."),
        invitee: inviteeInput,
        eventGuests: s.stringArray("The guest email addresses to add to the booking.", {
          itemDescription: "One guest email address to add to the booking.",
        }),
        questionsAndAnswers: s.array(questionAndAnswerInput, {
          description: "The answers to custom questions to submit with the booking.",
        }),
        tracking,
        location: locationInput,
      },
      ["eventTypeUri", "startTime", "invitee"],
    ),
    resourceOutput("invitee", "A Calendly invitee resource."),
    ["scheduled_events:write"],
  ),
  action(
    "list_event_type_available_times",
    "read",
    "List available time slots for one Calendly event type within a 7-day window.",
    input(
      {
        eventTypeUri,
        startTime: isoDateTime("The inclusive start of the availability window in ISO 8601 format."),
        endTime: isoDateTime("The exclusive end of the availability window in ISO 8601 format."),
      },
      ["eventTypeUri", "startTime", "endTime"],
    ),
    s.actionOutput(
      {
        availableTimes: rawArray("The available time slots returned by Calendly.", "One Calendly available time slot."),
      },
      "The response wrapper for event-type available times.",
    ),
    ["availability:write"],
  ),
  action(
    "list_event_type_availability_schedules",
    "read",
    "List the official Calendly availability schedules attached to one event type.",
    input({ eventTypeUri }, ["eventTypeUri"]),
    s.actionOutput(
      {
        collection: rawArray(
          "The event type availability schedules returned by Calendly.",
          "One event type availability schedule returned by Calendly.",
        ),
        pagination: officialPagination,
      },
      "The official response wrapper for event type availability schedules.",
    ),
    ["availability:write"],
  ),
  action(
    "update_event_type_availability_schedule",
    "write",
    "Update the official Calendly availability schedule for one event type.",
    input(
      {
        eventTypeUri,
        availability_rule: availabilityRuleInput,
        availability_setting: s.stringEnum(["host"], {
          description: "The event type availability setting to apply to the event type.",
        }),
      },
      ["eventTypeUri", "availability_rule"],
    ),
    resourceOutput("resource", "One event type availability schedule returned by Calendly."),
    ["availability:write"],
  ),
  action(
    "list_scheduled_events",
    "read",
    "List Calendly scheduled events for exactly one user or one organization.",
    input({
      userUri,
      organizationUri,
      inviteeEmail: s.email("The invitee email used to filter scheduled events."),
      status: s.stringEnum(["active", "canceled"], {
        description: "The scheduled-event status filter accepted by Calendly.",
      }),
      minStartTime: isoDateTime("The minimum scheduled start time filter in ISO 8601 format."),
      maxStartTime: isoDateTime("The maximum scheduled start time filter in ISO 8601 format."),
      count,
      pageToken,
      sort: s.stringEnum(["start_time:asc", "start_time:desc"], {
        description: "The sort expression accepted by Calendly for scheduled events.",
      }),
    }),
    listOutput("scheduledEvents", "The scheduled events returned by Calendly."),
    ["scheduled_events:write"],
  ),
  action(
    "get_scheduled_event",
    "read",
    "Retrieve one Calendly scheduled event by scheduled-event URI.",
    input({ scheduledEventUri }, ["scheduledEventUri"]),
    resourceOutput("scheduledEvent", "A Calendly scheduled event resource."),
    ["scheduled_events:write"],
  ),
  action(
    "cancel_scheduled_event",
    "destructive",
    "Cancel one Calendly scheduled event by scheduled-event URI.",
    input(
      {
        scheduledEventUri,
        reason: s.nonEmptyString("The human-readable reason to cancel the scheduled event."),
      },
      ["scheduledEventUri", "reason"],
    ),
    booleanOutput("canceled", "The response wrapper for a Calendly scheduled-event cancellation."),
    ["scheduled_events:write"],
  ),
  action(
    "list_event_invitees",
    "read",
    "List invitees for one Calendly scheduled event.",
    input(
      {
        scheduledEventUri,
        email: s.email("The invitee email filter."),
        status: s.stringEnum(["active", "canceled"], {
          description: "The invitee status filter accepted by Calendly.",
        }),
        count,
        pageToken,
        sort: s.stringEnum(["created_at:asc", "created_at:desc"], {
          description: "The sort expression accepted by Calendly for invitees.",
        }),
      },
      ["scheduledEventUri"],
    ),
    listOutput("invitees", "The invitees returned by Calendly."),
    ["scheduled_events:write"],
  ),
  action(
    "get_event_invitee",
    "read",
    "Retrieve one Calendly invitee by invitee URI.",
    input({ scheduledEventUri, inviteeUri }, ["scheduledEventUri", "inviteeUri"]),
    resourceOutput("invitee", "A Calendly invitee resource."),
    ["scheduled_events:write"],
  ),
  action(
    "create_invitee_no_show",
    "write",
    "Mark one Calendly invitee as a no-show by invitee URI.",
    input({ inviteeUri }, ["inviteeUri"]),
    resourceOutput("inviteeNoShow", "A Calendly invitee no-show resource."),
    ["scheduled_events:write"],
  ),
  action(
    "get_invitee_no_show",
    "read",
    "Retrieve one Calendly invitee no-show by no-show URI.",
    input({ inviteeNoShowUri }, ["inviteeNoShowUri"]),
    resourceOutput("inviteeNoShow", "A Calendly invitee no-show resource."),
    ["scheduled_events:write"],
  ),
  action(
    "delete_invitee_no_show",
    "destructive",
    "Delete one Calendly invitee no-show by no-show URI.",
    input({ inviteeNoShowUri }, ["inviteeNoShowUri"]),
    booleanOutput("deleted", "The response wrapper for deleting one Calendly invitee no-show."),
    ["scheduled_events:write"],
  ),
  action(
    "list_routing_forms",
    "read",
    "List Calendly routing forms for one organization.",
    input(
      {
        organizationUri,
        count,
        pageToken,
        sort: s.stringEnum(["created_at:asc", "created_at:desc"], {
          description: "The sort expression accepted by Calendly for routing forms.",
        }),
      },
      ["organizationUri"],
    ),
    listOutput("routingForms", "The routing forms returned by Calendly."),
    ["routing_forms:read"],
  ),
  action(
    "get_routing_form",
    "read",
    "Retrieve one Calendly routing form by routing-form URI.",
    input({ routingFormUri }, ["routingFormUri"]),
    resourceOutput("routingForm", "A Calendly routing form resource."),
    ["routing_forms:read"],
  ),
  action(
    "list_routing_form_submissions",
    "read",
    "List Calendly routing form submissions for one routing form.",
    input(
      {
        routingFormUri,
        count,
        pageToken,
        sort: s.stringEnum(["created_at:asc", "created_at:desc"], {
          description: "The sort expression accepted by Calendly for routing form submissions.",
        }),
      },
      ["routingFormUri"],
    ),
    listOutput("routingFormSubmissions", "The routing form submissions returned by Calendly."),
    ["routing_forms:read"],
  ),
  action(
    "get_routing_form_submission",
    "read",
    "Retrieve one Calendly routing form submission by submission URI.",
    input({ routingFormSubmissionUri }, ["routingFormSubmissionUri"]),
    resourceOutput("routingFormSubmission", "A Calendly routing form submission resource."),
    ["routing_forms:read"],
  ),
  action(
    "list_user_meeting_locations",
    "read",
    "List the configured meeting locations for one Calendly user.",
    input({ userUri }, ["userUri"]),
    s.actionOutput(
      {
        meetingLocations: rawArray(
          "The configured meeting locations returned by Calendly.",
          "One meeting location returned by Calendly.",
        ),
      },
      "The response wrapper for Calendly user meeting locations.",
    ),
    ["locations:read"],
  ),
  action(
    "create_webhook_subscription",
    "write",
    "Create one Calendly webhook subscription for an organization or one user.",
    input(
      {
        url: s.url("The callback URL that should receive Calendly webhook deliveries."),
        scope: s.stringEnum(["organization", "user"], { description: "The webhook subscription scope to create." }),
        organizationUri,
        userUri,
        events: s.array(webhookEvent, {
          minItems: 1,
          description: "The webhook event values to subscribe to.",
        }),
      },
      ["url", "scope", "organizationUri", "events"],
    ),
    resourceOutput("webhookSubscription", "One Calendly webhook subscription returned by the API."),
    ["webhooks:write"],
  ),
  action(
    "list_webhook_subscriptions",
    "read",
    "List Calendly webhook subscriptions for an organization or one user.",
    input(
      {
        scope: s.stringEnum(["organization", "user"], { description: "The webhook subscription scope to list." }),
        organizationUri,
        userUri,
        count,
        pageToken,
        sort: s.stringEnum(["created_at:asc", "created_at:desc"], {
          description: "The sort expression accepted by Calendly for webhook subscriptions.",
        }),
      },
      ["scope", "organizationUri"],
    ),
    listOutput("webhookSubscriptions", "The webhook subscriptions returned by Calendly."),
    ["webhooks:write"],
  ),
  action(
    "get_webhook_subscription",
    "read",
    "Retrieve one Calendly webhook subscription by URI.",
    input({ webhookSubscriptionUri }, ["webhookSubscriptionUri"]),
    resourceOutput("webhookSubscription", "One Calendly webhook subscription returned by the API."),
    ["webhooks:write"],
  ),
  action(
    "delete_webhook_subscription",
    "destructive",
    "Delete one Calendly webhook subscription by URI.",
    input({ webhookSubscriptionUri }, ["webhookSubscriptionUri"]),
    booleanOutput("deleted", "The response wrapper for deleting one Calendly webhook subscription."),
    ["webhooks:write"],
  ),
  action(
    "list_user_availability_schedules",
    "read",
    "List user availability schedules for one Calendly user.",
    input({ userUri }, ["userUri"]),
    listOutput("availabilitySchedules", "The availability schedules returned by Calendly."),
    ["availability:write"],
  ),
  action(
    "get_user_availability_schedule",
    "read",
    "Retrieve one Calendly user availability schedule by schedule URI.",
    input({ availabilityScheduleUri }, ["availabilityScheduleUri"]),
    resourceOutput("availabilitySchedule", "A Calendly user availability schedule resource."),
    ["availability:write"],
  ),
  action(
    "list_user_busy_times",
    "read",
    "List busy time slots for one Calendly user within a 7-day window.",
    input(
      {
        userUri,
        startTime: isoDateTime("The inclusive start of the busy-times window in ISO 8601 format."),
        endTime: isoDateTime("The exclusive end of the busy-times window in ISO 8601 format."),
      },
      ["userUri", "startTime", "endTime"],
    ),
    s.actionOutput(
      {
        busyTimes: rawArray("The busy-time slots returned by Calendly.", "One Calendly busy-time slot."),
        pagination,
      },
      "The response wrapper for Calendly busy-time results.",
    ),
    ["availability:write"],
  ),
];

function action(
  name: CalendlyActionName,
  operationType: ActionDefinition["operationType"],
  description: string,
  inputSchema: JsonSchema,
  outputSchema: JsonSchema,
  requiredScopes: string[],
): ActionDefinition {
  return defineProviderAction(service, {
    name,
    operationType,
    description,
    requiredScopes,
    inputSchema,
    outputSchema,
  });
}

function input(properties: Record<string, JsonSchema>, required: string[] = []): JsonSchema {
  return s.actionInput(properties, required, "Calendly action input.");
}

function resourceOutput(key: string, description: string): JsonSchema {
  return s.actionOutput({ [key]: raw(description) }, `The response wrapper for ${key}.`);
}

function listOutput(key: string, description: string): JsonSchema {
  return s.actionOutput(
    {
      [key]: rawArray(description, `One item returned by ${service}.`),
      pagination,
    },
    `The list response wrapper for ${key}.`,
  );
}

function booleanOutput(key: string, description: string): JsonSchema {
  return s.actionOutput(
    { [key]: s.boolean({ description: `Whether Calendly accepted the ${key} request.` }) },
    description,
  );
}
