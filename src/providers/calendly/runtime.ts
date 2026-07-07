import type { BearerProviderContext } from "../provider-runtime.ts";
import type { CalendlyActionName } from "./actions.ts";

import { compactObject, optionalBoolean, optionalNumber, optionalRecord, optionalString } from "../../core/cast.ts";
import { providerUserAgent, ProviderRequestError } from "../provider-runtime.ts";

type CalendlyActionContext = BearerProviderContext;

type CalendlyActionHandler = (input: Record<string, unknown>, context: CalendlyActionContext) => Promise<unknown>;

type CalendlyRequestMode = "validate" | "execute";

type CalendlyRequestOptions = {
  path: string;
  accessToken: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
  mode: CalendlyRequestMode;
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  query?: Record<string, string | undefined>;
  body?: Record<string, unknown>;
  notFoundAsInvalidInput?: boolean;
};

export const calendlyApiOrigin: string = "https://api.calendly.com";
const calendlyValidationPath = "/users/me";

export const calendlyActionHandlers: Record<CalendlyActionName, CalendlyActionHandler> = {
  get_current_user(_input, context) {
    return getCurrentUser(context);
  },
  get_user(input, context) {
    return getUser(input, context);
  },
  get_organization(input, context) {
    return getOrganization(input, context);
  },
  list_organization_memberships(input, context) {
    return listOrganizationMemberships(input, context);
  },
  get_organization_membership(input, context) {
    return getOrganizationMembership(input, context);
  },
  delete_organization_membership(input, context) {
    return deleteOrganizationMembership(input, context);
  },
  list_organization_invitations(input, context) {
    return listOrganizationInvitations(input, context);
  },
  create_organization_invitation(input, context) {
    return createOrganizationInvitation(input, context);
  },
  revoke_organization_invitation(input, context) {
    return revokeOrganizationInvitation(input, context);
  },
  list_event_types(input, context) {
    return listEventTypes(input, context);
  },
  get_event_type(input, context) {
    return getEventType(input, context);
  },
  create_single_use_scheduling_link(input, context) {
    return createSingleUseSchedulingLink(input, context);
  },
  create_share(input, context) {
    return createShare(input, context);
  },
  create_event_invitee(input, context) {
    return createEventInvitee(input, context);
  },
  list_event_type_available_times(input, context) {
    return listEventTypeAvailableTimes(input, context);
  },
  list_event_type_availability_schedules(input, context) {
    return listEventTypeAvailabilitySchedules(input, context);
  },
  update_event_type_availability_schedule(input, context) {
    return updateEventTypeAvailabilitySchedule(input, context);
  },
  list_scheduled_events(input, context) {
    return listScheduledEvents(input, context);
  },
  get_scheduled_event(input, context) {
    return getScheduledEvent(input, context);
  },
  cancel_scheduled_event(input, context) {
    return cancelScheduledEvent(input, context);
  },
  list_event_invitees(input, context) {
    return listEventInvitees(input, context);
  },
  get_event_invitee(input, context) {
    return getEventInvitee(input, context);
  },
  create_invitee_no_show(input, context) {
    return createInviteeNoShow(input, context);
  },
  get_invitee_no_show(input, context) {
    return getInviteeNoShow(input, context);
  },
  delete_invitee_no_show(input, context) {
    return deleteInviteeNoShow(input, context);
  },
  list_routing_forms(input, context) {
    return listRoutingForms(input, context);
  },
  get_routing_form(input, context) {
    return getRoutingForm(input, context);
  },
  list_routing_form_submissions(input, context) {
    return listRoutingFormSubmissions(input, context);
  },
  get_routing_form_submission(input, context) {
    return getRoutingFormSubmission(input, context);
  },
  list_user_meeting_locations(input, context) {
    return listUserMeetingLocations(input, context);
  },
  create_webhook_subscription(input, context) {
    return createWebhookSubscription(input, context);
  },
  list_webhook_subscriptions(input, context) {
    return listWebhookSubscriptions(input, context);
  },
  get_webhook_subscription(input, context) {
    return getWebhookSubscription(input, context);
  },
  delete_webhook_subscription(input, context) {
    return deleteWebhookSubscription(input, context);
  },
  list_user_availability_schedules(input, context) {
    return listUserAvailabilitySchedules(input, context);
  },
  get_user_availability_schedule(input, context) {
    return getUserAvailabilitySchedule(input, context);
  },
  list_user_busy_times(input, context) {
    return listUserBusyTimes(input, context);
  },
};

export async function validateCalendlyCredential(
  accessToken: string,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<{
  profile: { accountId: string; displayName: string; grantedScopes: string[] };
  metadata: Record<string, unknown>;
}> {
  const payload = await requestCalendlyJson({
    path: calendlyValidationPath,
    accessToken: accessToken,
    fetcher,
    signal,
    mode: "validate",
  });
  const user = readResourceObject(payload, "current user");
  const userUri = requireString(user.uri, "uri");

  return {
    profile: {
      accountId: extractCalendlyIdFromUri(userUri, "users"),
      displayName: optionalString(user.name) ?? optionalString(user.email) ?? "Calendly User",
      grantedScopes: [],
    },
    metadata: compactObject({
      apiBaseUrl: calendlyApiOrigin,
      validationEndpoint: calendlyValidationPath,
      userUri,
      organizationUri: optionalString(user.current_organization),
      schedulingUrl: optionalString(user.scheduling_url),
      email: optionalString(user.email),
      timezone: optionalString(user.timezone),
    }),
  };
}

async function getCurrentUser(context: CalendlyActionContext) {
  const payload = await requestCalendlyJson({
    path: calendlyValidationPath,
    accessToken: context.accessToken,
    fetcher: context.fetcher,
    mode: "execute",
  });

  return {
    currentUser: readResourceObject(payload, "current user"),
  };
}

async function getUser(input: Record<string, unknown>, context: CalendlyActionContext) {
  const userId = extractCalendlyIdFromUri(requireString(input.userUri, "userUri"), "users");
  const payload = await requestCalendlyJson({
    path: `/users/${encodeURIComponent(userId)}`,
    accessToken: context.accessToken,
    fetcher: context.fetcher,
    mode: "execute",
    notFoundAsInvalidInput: true,
  });

  return {
    user: readResourceObject(payload, "user"),
  };
}

async function getOrganization(input: Record<string, unknown>, context: CalendlyActionContext) {
  const organizationId = extractCalendlyIdFromUri(
    requireString(input.organizationUri, "organizationUri"),
    "organizations",
  );
  const payload = await requestCalendlyJson({
    path: `/organizations/${encodeURIComponent(organizationId)}`,
    accessToken: context.accessToken,
    fetcher: context.fetcher,
    mode: "execute",
    notFoundAsInvalidInput: true,
  });

  return {
    organization: readResourceObject(payload, "organization"),
  };
}

async function listOrganizationMemberships(input: Record<string, unknown>, context: CalendlyActionContext) {
  const payload = await requestCalendlyJson({
    path: "/organization_memberships",
    accessToken: context.accessToken,
    fetcher: context.fetcher,
    mode: "execute",
    query: compactQuery({
      organization: optionalString(input.organizationUri),
      user: optionalString(input.userUri),
      email: optionalString(input.email),
      count: stringifyNumber(input.count),
      page_token: optionalString(input.pageToken),
    }),
  });

  return {
    organizationMemberships: readCollection(payload, "organization memberships"),
    pagination: readPagination(payload),
  };
}

async function getOrganizationMembership(input: Record<string, unknown>, context: CalendlyActionContext) {
  const membershipId = extractCalendlyIdFromUri(
    requireString(input.organizationMembershipUri, "organizationMembershipUri"),
    "organization_memberships",
  );
  const payload = await requestCalendlyJson({
    path: `/organization_memberships/${encodeURIComponent(membershipId)}`,
    accessToken: context.accessToken,
    fetcher: context.fetcher,
    mode: "execute",
    notFoundAsInvalidInput: true,
  });

  return {
    organizationMembership: readResourceObject(payload, "organization membership"),
  };
}

async function deleteOrganizationMembership(input: Record<string, unknown>, context: CalendlyActionContext) {
  const membershipId = extractCalendlyIdFromUri(
    requireString(input.organizationMembershipUri, "organizationMembershipUri"),
    "organization_memberships",
  );
  await requestCalendlyJson({
    path: `/organization_memberships/${encodeURIComponent(membershipId)}`,
    accessToken: context.accessToken,
    fetcher: context.fetcher,
    mode: "execute",
    method: "DELETE",
    notFoundAsInvalidInput: true,
  });

  return {
    deleted: true,
  };
}

async function listOrganizationInvitations(input: Record<string, unknown>, context: CalendlyActionContext) {
  const organizationId = extractCalendlyIdFromUri(
    requireString(input.organizationUri, "organizationUri"),
    "organizations",
  );
  const payload = await requestCalendlyJson({
    path: `/organizations/${encodeURIComponent(organizationId)}/invitations`,
    accessToken: context.accessToken,
    fetcher: context.fetcher,
    mode: "execute",
    query: compactQuery({
      count: stringifyNumber(input.count),
      page_token: optionalString(input.pageToken),
      sort: optionalString(input.sort),
      email: optionalString(input.email),
      status: optionalString(input.status),
    }),
    notFoundAsInvalidInput: true,
  });

  return {
    organizationInvitations: readCollection(payload, "organization invitations"),
    pagination: readPagination(payload),
  };
}

async function createOrganizationInvitation(input: Record<string, unknown>, context: CalendlyActionContext) {
  const organizationId = extractCalendlyIdFromUri(
    requireString(input.organizationUri, "organizationUri"),
    "organizations",
  );
  const payload = await requestCalendlyJson({
    path: `/organizations/${encodeURIComponent(organizationId)}/invitations`,
    accessToken: context.accessToken,
    fetcher: context.fetcher,
    mode: "execute",
    method: "POST",
    body: {
      email: requireString(input.email, "email"),
    },
    notFoundAsInvalidInput: true,
  });

  return {
    organizationInvitation: readResourceObject(payload, "organization invitation"),
  };
}

async function revokeOrganizationInvitation(input: Record<string, unknown>, context: CalendlyActionContext) {
  const organizationId = extractCalendlyIdFromUri(
    requireString(input.organizationUri, "organizationUri"),
    "organizations",
  );
  const invitationReference = extractOrganizationInvitationReference(
    requireString(input.organizationInvitationUri, "organizationInvitationUri"),
  );
  if (invitationReference.organizationId !== organizationId) {
    throw new ProviderRequestError(400, "organizationInvitationUri must belong to the organizationUri");
  }

  await requestCalendlyJson({
    path: `/organizations/${encodeURIComponent(organizationId)}/invitations/${encodeURIComponent(invitationReference.invitationId)}`,
    accessToken: context.accessToken,
    fetcher: context.fetcher,
    mode: "execute",
    method: "DELETE",
    notFoundAsInvalidInput: true,
  });

  return {
    revoked: true,
  };
}

async function listEventTypes(input: Record<string, unknown>, context: CalendlyActionContext) {
  const payload = await requestCalendlyJson({
    path: "/event_types",
    accessToken: context.accessToken,
    fetcher: context.fetcher,
    mode: "execute",
    query: compactQuery({
      organization: optionalString(input.organizationUri),
      user: optionalString(input.userUri),
      active: stringifyBoolean(input.active),
      admin_managed: stringifyBoolean(input.adminManaged),
      user_availability_schedule: optionalString(input.userAvailabilityScheduleUri),
      count: stringifyNumber(input.count),
      page_token: optionalString(input.pageToken),
      sort: optionalString(input.sort),
    }),
  });

  return {
    eventTypes: readCollection(payload, "event types"),
    pagination: readPagination(payload),
  };
}

async function getEventType(input: Record<string, unknown>, context: CalendlyActionContext) {
  const eventTypeId = extractCalendlyIdFromUri(requireString(input.eventTypeUri, "eventTypeUri"), "event_types");
  const payload = await requestCalendlyJson({
    path: `/event_types/${encodeURIComponent(eventTypeId)}`,
    accessToken: context.accessToken,
    fetcher: context.fetcher,
    mode: "execute",
    notFoundAsInvalidInput: true,
  });

  return {
    eventType: readResourceObject(payload, "event type"),
  };
}

async function createSingleUseSchedulingLink(input: Record<string, unknown>, context: CalendlyActionContext) {
  const payload = await requestCalendlyJson({
    path: "/scheduling_links",
    accessToken: context.accessToken,
    fetcher: context.fetcher,
    mode: "execute",
    method: "POST",
    body: {
      max_event_count: 1,
      owner: requireString(input.eventTypeUri, "eventTypeUri"),
      owner_type: "EventType",
    },
    notFoundAsInvalidInput: true,
  });

  return {
    schedulingLink: readResourceObject(payload, "single-use scheduling link"),
  };
}

async function createShare(input: Record<string, unknown>, context: CalendlyActionContext) {
  const payload = await requestCalendlyJson({
    path: "/shares",
    accessToken: context.accessToken,
    fetcher: context.fetcher,
    mode: "execute",
    method: "POST",
    body: compactObject({
      event_type: requireString(input.eventTypeUri, "eventTypeUri"),
      name: optionalString(input.name),
      duration: optionalNumber(input.duration),
      duration_options: Array.isArray(input.durationOptions) ? input.durationOptions : undefined,
      period_type: optionalString(input.periodType),
      start_date: optionalString(input.startDate),
      end_date: optionalString(input.endDate),
      max_booking_time: optionalNumber(input.maxBookingTime),
      hide_location: optionalBoolean(input.hideLocation),
      location_configurations: Array.isArray(input.locationConfigurations)
        ? input.locationConfigurations.map((item) => mapShareLocationConfiguration(item))
        : undefined,
      availability_rule: optionalRecord(input.availabilityRule)
        ? mapAvailabilityRuleObject(input.availabilityRule)
        : undefined,
    }),
    notFoundAsInvalidInput: true,
  });

  return {
    share: readResourceObject(payload, "share"),
  };
}

async function createEventInvitee(input: Record<string, unknown>, context: CalendlyActionContext) {
  const invitee = requireObject(input.invitee, "invitee");
  const payload = await requestCalendlyJson({
    path: "/invitees",
    accessToken: context.accessToken,
    fetcher: context.fetcher,
    mode: "execute",
    method: "POST",
    body: compactObject({
      event_type: requireString(input.eventTypeUri, "eventTypeUri"),
      start_time: requireString(input.startTime, "startTime"),
      invitee: compactObject({
        name: requireString(invitee.name, "invitee.name"),
        first_name: optionalString(invitee.firstName),
        last_name: optionalString(invitee.lastName),
        email: requireString(invitee.email, "invitee.email"),
        timezone: requireString(invitee.timezone, "invitee.timezone"),
        text_reminder_number: optionalString(invitee.textReminderNumber),
      }),
      event_guests: Array.isArray(input.eventGuests) ? input.eventGuests : undefined,
      questions_and_answers: Array.isArray(input.questionsAndAnswers)
        ? input.questionsAndAnswers.map((item) => {
            const questionAndAnswer = requireObject(item, "questionsAndAnswers[]");
            return compactObject({
              question: requireString(questionAndAnswer.question, "questionsAndAnswers[].question"),
              answer: requireString(questionAndAnswer.answer, "questionsAndAnswers[].answer"),
              position: optionalNumber(questionAndAnswer.position),
            });
          })
        : undefined,
      tracking: optionalRecord(input.tracking),
      location: optionalRecord(input.location),
    }),
    notFoundAsInvalidInput: true,
  });

  return {
    invitee: readResourceObject(payload, "created invitee"),
  };
}

async function listEventTypeAvailableTimes(input: Record<string, unknown>, context: CalendlyActionContext) {
  const payload = await requestCalendlyJson({
    path: "/event_type_available_times",
    accessToken: context.accessToken,
    fetcher: context.fetcher,
    mode: "execute",
    query: compactQuery({
      event_type: requireString(input.eventTypeUri, "eventTypeUri"),
      start_time: requireString(input.startTime, "startTime"),
      end_time: requireString(input.endTime, "endTime"),
    }),
  });

  return {
    availableTimes: readCollection(payload, "available times"),
  };
}

async function listEventTypeAvailabilitySchedules(input: Record<string, unknown>, context: CalendlyActionContext) {
  const payload = await requestCalendlyJson({
    path: "/event_type_availability_schedules",
    accessToken: context.accessToken,
    fetcher: context.fetcher,
    mode: "execute",
    query: {
      event_type: requireString(input.eventTypeUri, "eventTypeUri"),
    },
    notFoundAsInvalidInput: true,
  });

  return {
    collection: readCollection(payload, "event type availability schedules"),
    pagination: readOfficialPagination(payload),
  };
}

async function updateEventTypeAvailabilitySchedule(input: Record<string, unknown>, context: CalendlyActionContext) {
  const eventTypeId = extractCalendlyIdFromUri(requireString(input.eventTypeUri, "eventTypeUri"), "event_types");
  const availabilityRule = requireObject(input.availability_rule, "availability_rule");
  const payload = await requestCalendlyJson({
    path: `/event_type_availability_schedules/${encodeURIComponent(eventTypeId)}`,
    accessToken: context.accessToken,
    fetcher: context.fetcher,
    mode: "execute",
    method: "PATCH",
    body: compactObject({
      availability_rule: mapAvailabilityRuleObject(availabilityRule),
      availability_setting: optionalString(input.availability_setting),
    }),
    notFoundAsInvalidInput: true,
  });

  return {
    resource: readResourceObject(payload, "event type availability schedule"),
  };
}

async function listScheduledEvents(input: Record<string, unknown>, context: CalendlyActionContext) {
  const payload = await requestCalendlyJson({
    path: "/scheduled_events",
    accessToken: context.accessToken,
    fetcher: context.fetcher,
    mode: "execute",
    query: compactQuery({
      organization: optionalString(input.organizationUri),
      user: optionalString(input.userUri),
      invitee_email: optionalString(input.inviteeEmail),
      status: optionalString(input.status),
      min_start_time: optionalString(input.minStartTime),
      max_start_time: optionalString(input.maxStartTime),
      count: stringifyNumber(input.count),
      page_token: optionalString(input.pageToken),
      sort: optionalString(input.sort),
    }),
  });

  return {
    scheduledEvents: readCollection(payload, "scheduled events"),
    pagination: readPagination(payload),
  };
}

async function getScheduledEvent(input: Record<string, unknown>, context: CalendlyActionContext) {
  const scheduledEventId = extractCalendlyIdFromUri(
    requireString(input.scheduledEventUri, "scheduledEventUri"),
    "scheduled_events",
  );
  const payload = await requestCalendlyJson({
    path: `/scheduled_events/${encodeURIComponent(scheduledEventId)}`,
    accessToken: context.accessToken,
    fetcher: context.fetcher,
    mode: "execute",
    notFoundAsInvalidInput: true,
  });

  return {
    scheduledEvent: readResourceObject(payload, "scheduled event"),
  };
}

async function cancelScheduledEvent(input: Record<string, unknown>, context: CalendlyActionContext) {
  const scheduledEventId = extractCalendlyIdFromUri(
    requireString(input.scheduledEventUri, "scheduledEventUri"),
    "scheduled_events",
  );

  await requestCalendlyJson({
    path: `/scheduled_events/${encodeURIComponent(scheduledEventId)}/cancellation`,
    accessToken: context.accessToken,
    fetcher: context.fetcher,
    mode: "execute",
    method: "POST",
    body: {
      reason: requireString(input.reason, "reason"),
    },
    notFoundAsInvalidInput: true,
  });

  return {
    canceled: true,
  };
}

async function listEventInvitees(input: Record<string, unknown>, context: CalendlyActionContext) {
  const scheduledEventId = extractCalendlyIdFromUri(
    requireString(input.scheduledEventUri, "scheduledEventUri"),
    "scheduled_events",
  );
  const payload = await requestCalendlyJson({
    path: `/scheduled_events/${encodeURIComponent(scheduledEventId)}/invitees`,
    accessToken: context.accessToken,
    fetcher: context.fetcher,
    mode: "execute",
    query: compactQuery({
      email: optionalString(input.email),
      status: optionalString(input.status),
      count: stringifyNumber(input.count),
      page_token: optionalString(input.pageToken),
      sort: optionalString(input.sort),
    }),
  });

  return {
    invitees: readCollection(payload, "event invitees"),
    pagination: readPagination(payload),
  };
}

async function getEventInvitee(input: Record<string, unknown>, context: CalendlyActionContext) {
  const scheduledEventId = extractCalendlyIdFromUri(
    requireString(input.scheduledEventUri, "scheduledEventUri"),
    "scheduled_events",
  );
  const inviteeReference = extractInviteeReference(requireString(input.inviteeUri, "inviteeUri"));
  if (inviteeReference.scheduledEventId !== scheduledEventId) {
    throw new ProviderRequestError(400, "inviteeUri must belong to the scheduledEventUri");
  }
  const payload = await requestCalendlyJson({
    path: `/scheduled_events/${encodeURIComponent(scheduledEventId)}/invitees/${encodeURIComponent(inviteeReference.inviteeId)}`,
    accessToken: context.accessToken,
    fetcher: context.fetcher,
    mode: "execute",
    notFoundAsInvalidInput: true,
  });

  return {
    invitee: readResourceObject(payload, "event invitee"),
  };
}

async function createInviteeNoShow(input: Record<string, unknown>, context: CalendlyActionContext) {
  const payload = await requestCalendlyJson({
    path: "/invitee_no_shows",
    accessToken: context.accessToken,
    fetcher: context.fetcher,
    mode: "execute",
    method: "POST",
    body: {
      invitee: requireString(input.inviteeUri, "inviteeUri"),
    },
    notFoundAsInvalidInput: true,
  });

  return {
    inviteeNoShow: readResourceObject(payload, "invitee no-show"),
  };
}

async function getInviteeNoShow(input: Record<string, unknown>, context: CalendlyActionContext) {
  const inviteeNoShowId = extractCalendlyIdFromUri(
    requireString(input.inviteeNoShowUri, "inviteeNoShowUri"),
    "invitee_no_shows",
  );
  const payload = await requestCalendlyJson({
    path: `/invitee_no_shows/${encodeURIComponent(inviteeNoShowId)}`,
    accessToken: context.accessToken,
    fetcher: context.fetcher,
    mode: "execute",
    notFoundAsInvalidInput: true,
  });

  return {
    inviteeNoShow: readResourceObject(payload, "invitee no-show"),
  };
}

async function deleteInviteeNoShow(input: Record<string, unknown>, context: CalendlyActionContext) {
  const inviteeNoShowId = extractCalendlyIdFromUri(
    requireString(input.inviteeNoShowUri, "inviteeNoShowUri"),
    "invitee_no_shows",
  );
  await requestCalendlyJson({
    path: `/invitee_no_shows/${encodeURIComponent(inviteeNoShowId)}`,
    accessToken: context.accessToken,
    fetcher: context.fetcher,
    mode: "execute",
    method: "DELETE",
    notFoundAsInvalidInput: true,
  });

  return {
    deleted: true,
  };
}

async function listRoutingForms(input: Record<string, unknown>, context: CalendlyActionContext) {
  const payload = await requestCalendlyJson({
    path: "/routing_forms",
    accessToken: context.accessToken,
    fetcher: context.fetcher,
    mode: "execute",
    query: compactQuery({
      organization: requireString(input.organizationUri, "organizationUri"),
      count: stringifyNumber(input.count),
      page_token: optionalString(input.pageToken),
      sort: optionalString(input.sort),
    }),
    notFoundAsInvalidInput: true,
  });

  return {
    routingForms: readCollection(payload, "routing forms"),
    pagination: readPagination(payload),
  };
}

async function getRoutingForm(input: Record<string, unknown>, context: CalendlyActionContext) {
  const routingFormId = extractCalendlyIdFromUri(
    requireString(input.routingFormUri, "routingFormUri"),
    "routing_forms",
  );
  const payload = await requestCalendlyJson({
    path: `/routing_forms/${encodeURIComponent(routingFormId)}`,
    accessToken: context.accessToken,
    fetcher: context.fetcher,
    mode: "execute",
    notFoundAsInvalidInput: true,
  });

  return {
    routingForm: readResourceObject(payload, "routing form"),
  };
}

async function listRoutingFormSubmissions(input: Record<string, unknown>, context: CalendlyActionContext) {
  const routingFormId = extractCalendlyIdFromUri(
    requireString(input.routingFormUri, "routingFormUri"),
    "routing_forms",
  );
  const payload = await requestCalendlyJson({
    path: `/routing_forms/${encodeURIComponent(routingFormId)}/submissions`,
    accessToken: context.accessToken,
    fetcher: context.fetcher,
    mode: "execute",
    query: compactQuery({
      count: stringifyNumber(input.count),
      page_token: optionalString(input.pageToken),
      sort: optionalString(input.sort),
    }),
    notFoundAsInvalidInput: true,
  });

  return {
    routingFormSubmissions: readCollection(payload, "routing form submissions"),
    pagination: readPagination(payload),
  };
}

async function getRoutingFormSubmission(input: Record<string, unknown>, context: CalendlyActionContext) {
  const routingFormSubmissionId = extractCalendlyIdFromUri(
    requireString(input.routingFormSubmissionUri, "routingFormSubmissionUri"),
    "routing_form_submissions",
  );
  const payload = await requestCalendlyJson({
    path: `/routing_form_submissions/${encodeURIComponent(routingFormSubmissionId)}`,
    accessToken: context.accessToken,
    fetcher: context.fetcher,
    mode: "execute",
    notFoundAsInvalidInput: true,
  });

  return {
    routingFormSubmission: readResourceObject(payload, "routing form submission"),
  };
}

async function listUserMeetingLocations(input: Record<string, unknown>, context: CalendlyActionContext) {
  const payload = await requestCalendlyJson({
    path: "/locations",
    accessToken: context.accessToken,
    fetcher: context.fetcher,
    mode: "execute",
    query: {
      user: requireString(input.userUri, "userUri"),
    },
    notFoundAsInvalidInput: true,
  });

  return {
    meetingLocations: readCollection(payload, "meeting locations"),
  };
}

async function createWebhookSubscription(input: Record<string, unknown>, context: CalendlyActionContext) {
  const payload = await requestCalendlyJson({
    path: "/webhook_subscriptions",
    accessToken: context.accessToken,
    fetcher: context.fetcher,
    mode: "execute",
    method: "POST",
    body: compactObject({
      url: requireString(input.url, "url"),
      events: input.events,
      organization: requireString(input.organizationUri, "organizationUri"),
      user: optionalString(input.userUri),
      scope: requireString(input.scope, "scope"),
    }),
    notFoundAsInvalidInput: true,
  });

  return {
    webhookSubscription: readResourceObject(payload, "webhook subscription"),
  };
}

async function listWebhookSubscriptions(input: Record<string, unknown>, context: CalendlyActionContext) {
  const payload = await requestCalendlyJson({
    path: "/webhook_subscriptions",
    accessToken: context.accessToken,
    fetcher: context.fetcher,
    mode: "execute",
    query: compactQuery({
      organization: requireString(input.organizationUri, "organizationUri"),
      user: optionalString(input.userUri),
      scope: requireString(input.scope, "scope"),
      count: stringifyNumber(input.count),
      page_token: optionalString(input.pageToken),
      sort: optionalString(input.sort),
    }),
    notFoundAsInvalidInput: true,
  });

  return {
    webhookSubscriptions: readCollection(payload, "webhook subscriptions"),
    pagination: readPagination(payload),
  };
}

async function getWebhookSubscription(input: Record<string, unknown>, context: CalendlyActionContext) {
  const webhookSubscriptionId = extractCalendlyIdFromUri(
    requireString(input.webhookSubscriptionUri, "webhookSubscriptionUri"),
    "webhook_subscriptions",
  );
  const payload = await requestCalendlyJson({
    path: `/webhook_subscriptions/${encodeURIComponent(webhookSubscriptionId)}`,
    accessToken: context.accessToken,
    fetcher: context.fetcher,
    mode: "execute",
    notFoundAsInvalidInput: true,
  });

  return {
    webhookSubscription: readResourceObject(payload, "webhook subscription"),
  };
}

async function deleteWebhookSubscription(input: Record<string, unknown>, context: CalendlyActionContext) {
  const webhookSubscriptionId = extractCalendlyIdFromUri(
    requireString(input.webhookSubscriptionUri, "webhookSubscriptionUri"),
    "webhook_subscriptions",
  );
  await requestCalendlyJson({
    path: `/webhook_subscriptions/${encodeURIComponent(webhookSubscriptionId)}`,
    accessToken: context.accessToken,
    fetcher: context.fetcher,
    mode: "execute",
    method: "DELETE",
    notFoundAsInvalidInput: true,
  });

  return {
    deleted: true,
  };
}

async function listUserAvailabilitySchedules(input: Record<string, unknown>, context: CalendlyActionContext) {
  const payload = await requestCalendlyJson({
    path: "/user_availability_schedules",
    accessToken: context.accessToken,
    fetcher: context.fetcher,
    mode: "execute",
    query: compactQuery({
      user: requireString(input.userUri, "userUri"),
    }),
  });

  return {
    availabilitySchedules: readCollection(payload, "user availability schedules"),
    pagination: readPagination(payload, true),
  };
}

async function getUserAvailabilitySchedule(input: Record<string, unknown>, context: CalendlyActionContext) {
  const availabilityScheduleId = extractCalendlyIdFromUri(
    requireString(input.availabilityScheduleUri, "availabilityScheduleUri"),
    "user_availability_schedules",
  );
  const payload = await requestCalendlyJson({
    path: `/user_availability_schedules/${encodeURIComponent(availabilityScheduleId)}`,
    accessToken: context.accessToken,
    fetcher: context.fetcher,
    mode: "execute",
    notFoundAsInvalidInput: true,
  });

  return {
    availabilitySchedule: readResourceObject(payload, "user availability schedule"),
  };
}

async function listUserBusyTimes(input: Record<string, unknown>, context: CalendlyActionContext) {
  const payload = await requestCalendlyJson({
    path: "/user_busy_times",
    accessToken: context.accessToken,
    fetcher: context.fetcher,
    mode: "execute",
    query: compactQuery({
      user: requireString(input.userUri, "userUri"),
      start_time: requireString(input.startTime, "startTime"),
      end_time: requireString(input.endTime, "endTime"),
    }),
  });

  return {
    busyTimes: readCollection(payload, "user busy times"),
    pagination: readPagination(payload, true),
  };
}

async function requestCalendlyJson(input: CalendlyRequestOptions) {
  const url = new URL(`${calendlyApiOrigin}${input.path}`);
  for (const [key, value] of Object.entries(input.query ?? {})) {
    if (value !== undefined) {
      url.searchParams.set(key, value);
    }
  }

  const headers = new Headers({
    accept: "application/json",
    authorization: `Bearer ${input.accessToken}`,
    "user-agent": providerUserAgent,
  });

  let body: string | undefined;
  if (input.body !== undefined) {
    headers.set("content-type", "application/json");
    body = JSON.stringify(input.body);
  }

  let response: Response;
  try {
    response = await input.fetcher(url, {
      method: input.method ?? "GET",
      headers,
      body,
      signal: input.signal,
    });
  } catch (error) {
    throw createCalendlyTransportError(error, "request");
  }

  let payload: Record<string, unknown>;
  try {
    payload = await parseJson(response);
  } catch (error) {
    throw createCalendlyTransportError(error, "response parsing");
  }

  if (!response.ok) {
    throw createCalendlyError(response, payload, input.mode, input.notFoundAsInvalidInput ?? false);
  }

  return payload;
}

async function parseJson(response: Response) {
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    if (response.status === 204) {
      return {};
    }
    throw new Error("Calendly response is not JSON");
  }

  return (await response.json()) as Record<string, unknown>;
}

function createCalendlyError(
  response: Response,
  payload: Record<string, unknown>,
  mode: CalendlyRequestMode,
  notFoundAsInvalidInput: boolean,
) {
  const message = readCalendlyErrorMessage(payload) ?? `Calendly request failed with status ${response.status}`;

  if (response.status === 400) {
    return new ProviderRequestError(400, message, payload);
  }

  if (response.status === 401) {
    return new ProviderRequestError(mode === "validate" ? 400 : 401, message, payload);
  }

  if (response.status === 404 && notFoundAsInvalidInput) {
    return new ProviderRequestError(404, message, payload);
  }

  if (response.status === 429) {
    return new ProviderRequestError(429, message, payload);
  }

  return new ProviderRequestError(response.status, message, payload);
}

function readCalendlyErrorMessage(payload: Record<string, unknown>) {
  return optionalString(payload.title) ?? optionalString(payload.message) ?? optionalString(payload.details);
}

function createCalendlyTransportError(error: unknown, phase: "request" | "response parsing") {
  const message =
    error instanceof Error && error.message ? `Calendly ${phase} failed: ${error.message}` : `Calendly ${phase} failed`;

  if (isAbortError(error)) {
    return new ProviderRequestError(504, message);
  }

  return new ProviderRequestError(502, message);
}

function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError";
}

function readResourceObject(payload: Record<string, unknown>, label: string) {
  const value = optionalRecord(payload.resource);
  if (!value) {
    throw new ProviderRequestError(502, `calendly ${label} response must be an object`);
  }
  return value;
}

function readCollection(payload: Record<string, unknown>, label: string) {
  const value = payload.collection;
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(502, `calendly ${label} response must be an array`);
  }

  return value.map((item) => {
    const object = optionalRecord(item);
    if (!object) {
      throw new ProviderRequestError(502, `calendly ${label} item must be an object`);
    }
    return object;
  });
}

function readPagination(payload: Record<string, unknown>, allowMissing = false) {
  const pagination = optionalRecord(payload.pagination);
  if (!pagination) {
    if (allowMissing) {
      return {
        count: undefined,
        nextPage: undefined,
        nextPageToken: undefined,
        previousPage: undefined,
        previousPageToken: undefined,
      };
    }

    throw new ProviderRequestError(502, "calendly pagination response must be an object");
  }

  return {
    count: optionalNumber(pagination.count),
    nextPage: asNullableString(pagination.next_page),
    nextPageToken: asNullableString(pagination.next_page_token),
    previousPage: asNullableString(pagination.previous_page),
    previousPageToken: asNullableString(pagination.previous_page_token),
  };
}

function readOfficialPagination(payload: Record<string, unknown>) {
  const pagination = optionalRecord(payload.pagination);
  if (!pagination) {
    throw new ProviderRequestError(502, "calendly pagination response must be an object");
  }

  return {
    count: optionalNumber(pagination.count),
    next_page: asNullableString(pagination.next_page),
    next_page_token: asNullableString(pagination.next_page_token),
    previous_page: asNullableString(pagination.previous_page),
    previous_page_token: asNullableString(pagination.previous_page_token),
  };
}

function extractCalendlyIdFromUri(uri: string, resource: string) {
  let url: URL;
  try {
    url = new URL(uri);
  } catch {
    throw new ProviderRequestError(400, `${resource} URI must be a valid URL`);
  }

  if (url.origin !== calendlyApiOrigin) {
    throw new ProviderRequestError(400, `${resource} URI must use origin ${calendlyApiOrigin}`);
  }

  const segments = url.pathname.split("/").filter(Boolean);
  const resourceIndex = segments.indexOf(resource);
  const id = resourceIndex >= 0 ? segments[resourceIndex + 1] : undefined;
  if (!id) {
    throw new ProviderRequestError(400, `${resource} URI must include a resource ID`);
  }

  return id;
}

function extractInviteeReference(uri: string) {
  let url: URL;
  try {
    url = new URL(uri);
  } catch {
    throw new ProviderRequestError(400, "inviteeUri must be a valid URL");
  }

  if (url.origin !== calendlyApiOrigin) {
    throw new ProviderRequestError(400, `inviteeUri must use origin ${calendlyApiOrigin}`);
  }

  const segments = url.pathname.split("/").filter(Boolean);
  if (
    segments.length !== 4 ||
    segments[0] !== "scheduled_events" ||
    segments[2] !== "invitees" ||
    !segments[1] ||
    !segments[3]
  ) {
    throw new ProviderRequestError(400, "inviteeUri must include both scheduled event ID and invitee ID");
  }

  return {
    scheduledEventId: segments[1],
    inviteeId: segments[3],
  };
}

function extractOrganizationInvitationReference(uri: string) {
  let url: URL;
  try {
    url = new URL(uri);
  } catch {
    throw new ProviderRequestError(400, "organizationInvitationUri must be a valid URL");
  }

  if (url.origin !== calendlyApiOrigin) {
    throw new ProviderRequestError(400, `organizationInvitationUri must use origin ${calendlyApiOrigin}`);
  }

  const segments = url.pathname.split("/").filter(Boolean);
  if (
    segments.length !== 4 ||
    segments[0] !== "organizations" ||
    segments[2] !== "invitations" ||
    !segments[1] ||
    !segments[3]
  ) {
    throw new ProviderRequestError(
      400,
      "organizationInvitationUri must include both organization ID and invitation ID",
    );
  }

  return {
    organizationId: segments[1],
    invitationId: segments[3],
  };
}

function requireString(value: unknown, fieldName: string) {
  const parsed = optionalString(value);
  if (!parsed) {
    throw new ProviderRequestError(400, `${fieldName} is required`);
  }
  return parsed;
}

function requireObject(value: unknown, fieldName: string) {
  const parsed = optionalRecord(value);
  if (!parsed) {
    throw new ProviderRequestError(400, `${fieldName} is required`);
  }
  return parsed;
}

function mapShareLocationConfiguration(value: unknown) {
  const object = requireObject(value, "locationConfigurations");
  return compactObject({
    location: optionalString(object.location),
    additional_info: optionalString(object.additionalInfo),
    phone_number: optionalString(object.phoneNumber),
    position: optionalNumber(object.position),
    kind: optionalString(object.kind),
  });
}

function mapAvailabilityRuleObject(value: unknown) {
  const object = requireObject(value, "availability_rule");
  return compactObject({
    timezone: requireString(object.timezone, "availability_rule.timezone"),
    rules: Array.isArray(object.rules) ? object.rules : undefined,
    user: optionalString(object.user),
  });
}

function compactQuery(value: Record<string, string | undefined>) {
  return Object.fromEntries(Object.entries(value).filter(([, child]) => child !== undefined));
}

function stringifyBoolean(value: unknown) {
  return typeof value === "boolean" ? String(value) : undefined;
}

function stringifyNumber(value: unknown) {
  return typeof value === "number" ? String(value) : undefined;
}

function asNullableString(value: unknown) {
  if (value === null) {
    return null;
  }
  return optionalString(value);
}
