import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "cal";

export const calProviderScopes: string[] = [
  "PROFILE_READ",
  "PROFILE_WRITE",
  "EVENT_TYPE_READ",
  "EVENT_TYPE_WRITE",
  "BOOKING_READ",
  "BOOKING_WRITE",
  "SCHEDULE_READ",
  "SCHEDULE_WRITE",
];

const profileRead = ["PROFILE_READ"];
const profileWrite = ["PROFILE_WRITE"];
const eventTypeRead = ["EVENT_TYPE_READ"];
const eventTypeWrite = ["EVENT_TYPE_WRITE"];
const bookingRead = ["BOOKING_READ"];
const bookingWrite = ["BOOKING_WRITE"];
const scheduleRead = ["SCHEDULE_READ"];
const scheduleWrite = ["SCHEDULE_WRITE"];

const rawObject = (description: string): JsonSchema => s.looseObject(description);
const rawArray = (description: string, itemDescription: string): JsonSchema =>
  s.array(description, rawObject(itemDescription));
const nullableRawObject = (description: string): JsonSchema => s.nullable(rawObject(description));
const emptyInputSchema = s.actionInput({}, [], "This action does not require any input.");
const limitField = s.integer("The maximum number of records to return.", { minimum: 1, maximum: 200 });
const cursorField = s.nonEmptyString("The opaque pagination cursor returned by Cal.com.");
const nextCursorField = s.nullableString(
  "The opaque cursor for the next page, or null when there are no more results.",
);
const teamIdField = s.integer("The numeric Cal.com team ID.");
const usernameField = s.nonEmptyString("The Cal.com username to scope the request to.");
const bookingUidField = s.nonEmptyString("The unique Cal.com booking UID.");
const scheduleIdField = s.integer("The numeric Cal.com schedule ID.");
const eventTypeIdField = s.integer("The numeric Cal.com event type ID.");
const looseEventTypeIdField = s.union(
  [s.integer("The numeric Cal.com event type ID."), s.nonEmptyString("The Cal.com event type string alias.")],
  { description: "The Cal.com event type ID, as a number or non-empty string." },
);
const eventTypeSlugField = s.nonEmptyString("The Cal.com event type slug.");
const teamSlugField = s.nonEmptyString("The Cal.com team slug.");
const organizationSlugField = s.nonEmptyString("The Cal.com organization slug.");
const timeZoneField = s.nonEmptyString("The IANA time zone used for this request.");
const isoDateTimeField = s.nonEmptyString("An ISO 8601 date-time string.");
const sortDirectionField = s.stringEnum("The sort direction.", ["asc", "desc"]);
const slotFormatField = s.stringEnum("The slot response format to request.", ["range", "time"]);

const profileOutputSchema = s.actionOutput(
  {
    profile: rawObject("The authenticated user's Cal.com profile."),
  },
  "The output payload for profile actions.",
);
const eventTypeOutputSchema = s.actionOutput(
  {
    eventType: rawObject("The requested Cal.com event type."),
  },
  "The output payload for a single event type.",
);
const eventTypesOutputSchema = s.actionOutput(
  {
    eventTypes: rawArray("The event types returned by Cal.com.", "One Cal.com event type."),
    nextCursor: nextCursorField,
  },
  "The output payload for listing event types.",
);
const privateLinksOutputSchema = s.actionOutput(
  {
    privateLinks: rawArray("The private links configured for the event type.", "One Cal.com private link."),
  },
  "The output payload for private link actions.",
);
const slotsOutputSchema = s.actionOutput(
  {
    slots: s.record(
      "The available slots keyed by date or grouping bucket.",
      s.array("The slots returned for this bucket.", rawObject("One Cal.com availability slot.")),
    ),
  },
  "The output payload for available-slot queries.",
);
const calendarListOutputSchema = s.actionOutput(
  {
    connectedCalendars: rawArray(
      "The connected calendars grouped by integration.",
      "One connected calendar integration group.",
    ),
    destinationCalendar: nullableRawObject("The destination calendar currently used for created events."),
  },
  "The output payload for calendar-list actions.",
);
const busyTimesOutputSchema = s.actionOutput(
  {
    busyTimes: rawArray("The busy ranges returned for the requested calendars.", "One Cal.com busy-time range."),
  },
  "The output payload for busy-time queries.",
);
const destinationCalendarOutputSchema = s.actionOutput(
  {
    destinationCalendar: rawObject("The updated destination calendar."),
  },
  "The output payload for destination-calendar actions.",
);
const bookingsOutputSchema = s.actionOutput(
  {
    bookings: rawArray("The bookings returned by Cal.com.", "One Cal.com booking."),
    nextCursor: nextCursorField,
  },
  "The output payload for booking-list actions.",
);
const bookingOutputSchema = s.actionOutput(
  {
    booking: s.union([rawObject("A Cal.com booking."), rawArray("Cal.com bookings.", "One Cal.com booking.")], {
      description: "The booking record or records returned by Cal.com.",
    }),
  },
  "The output payload for single-booking actions.",
);
const attendeesOutputSchema = s.actionOutput(
  {
    attendees: rawArray("The attendees returned for the booking.", "One Cal.com attendee."),
  },
  "The output payload for attendee-list actions.",
);
const attendeeOutputSchema = s.actionOutput(
  {
    attendee: rawObject("The attendee created by the action."),
  },
  "The output payload for attendee actions.",
);
const referencesOutputSchema = s.actionOutput(
  {
    references: rawArray("The booking references returned by Cal.com.", "One Cal.com booking reference."),
  },
  "The output payload for booking-reference actions.",
);
const resultOutputSchema = s.actionOutput(
  {
    result: s.unknown("The raw result payload returned by Cal.com."),
  },
  "The output payload for raw-result actions.",
);
const schedulesOutputSchema = s.actionOutput(
  {
    schedules: rawArray("The schedules returned by Cal.com.", "One Cal.com schedule."),
    nextCursor: nextCursorField,
  },
  "The output payload for schedule-list actions.",
);
const scheduleOutputSchema = s.actionOutput(
  {
    schedule: rawObject("The requested Cal.com schedule."),
  },
  "The output payload for single-schedule actions.",
);
const successOutputSchema = s.actionOutput(
  {
    success: s.boolean("Whether the operation completed successfully."),
  },
  "The output payload for success-only actions.",
);

const updateMyProfileInputSchema = s.looseObject("Profile fields to update on the authenticated Cal.com user.", {
  name: s.string("The display name to set on the profile."),
  bio: s.nullableString("The biography text to set on the profile."),
  avatarUrl: s.nullableString("The avatar URL to set on the profile."),
  brandColor: s.nullableString("The brand color hex code for the profile."),
  darkBrandColor: s.nullableString("The dark-mode brand color hex code for the profile."),
  theme: s.string("The Cal.com theme identifier to apply."),
  timeZone: timeZoneField,
  weekStart: s.string("The preferred first day of the week."),
  timeFormat: s.nullableInteger("The preferred time format, such as 12 or 24."),
  locale: s.string("The locale code for the profile."),
  email: s.email("The email address to set on the profile."),
  defaultScheduleId: s.nullableInteger("The numeric ID of the default schedule to use."),
});

const listEventTypesInputSchema = s.object(
  "Input payload for listing Cal.com event types.",
  {
    limit: limitField,
    cursor: cursorField,
    teamId: teamIdField,
    username: usernameField,
    status: s.string("Filter event types by status."),
    schedulingType: s.string("Filter event types by scheduling type."),
    onlyActive: s.boolean("Whether to return only active event types."),
  },
  { optional: ["limit", "cursor", "teamId", "username", "status", "schedulingType", "onlyActive"] },
);
const eventTypeLookupInputSchema = s.object(
  "Input payload for fetching an event type by numeric ID.",
  {
    eventTypeId: eventTypeIdField,
    username: usernameField,
    teamId: teamIdField,
  },
  { required: ["eventTypeId"], optional: ["username", "teamId"] },
);
const looseEventTypeLookupInputSchema = s.object(
  "Input payload for fetching an event type by ID or string alias.",
  {
    eventTypeId: looseEventTypeIdField,
    username: usernameField,
    teamId: teamIdField,
  },
  { required: ["eventTypeId"], optional: ["username", "teamId"] },
);
const eventTypeIdInputSchema = s.actionInput(
  {
    eventTypeId: eventTypeIdField,
  },
  ["eventTypeId"],
  "Input payload for targeting an event type.",
);
const createEventTypeInputSchema = s.object(
  "Input payload for creating a Cal.com event type.",
  {
    title: s.nonEmptyString("The title of the event type."),
    slug: s.nonEmptyString("The URL slug for the event type."),
    lengthInMinutes: s.positiveInteger("The duration of the event in minutes."),
    description: s.nullableString("The description of the event type."),
  },
  { required: ["title", "slug", "lengthInMinutes"], additionalProperties: true },
);
const updateEventTypeInputSchema = s.object(
  "Input payload for updating a Cal.com event type.",
  {
    eventTypeId: eventTypeIdField,
  },
  { required: ["eventTypeId"], additionalProperties: true },
);
const slotsInputSchema = s.object(
  "Input payload for retrieving available slots.",
  {
    eventTypeId: eventTypeIdField,
    eventTypeSlug: eventTypeSlugField,
    username: usernameField,
    usernames: s.nonEmptyString("A comma-separated list of usernames to query availability for."),
    teamSlug: teamSlugField,
    organizationSlug: organizationSlugField,
    start: isoDateTimeField,
    end: isoDateTimeField,
    timeZone: timeZoneField,
    duration: s.positiveInteger("The desired slot duration in minutes."),
    format: slotFormatField,
    bookingUidToReschedule: s.nonEmptyString("A booking UID to exclude while rescheduling."),
  },
  {
    required: ["start", "end"],
    optional: [
      "eventTypeId",
      "eventTypeSlug",
      "username",
      "usernames",
      "teamSlug",
      "organizationSlug",
      "timeZone",
      "duration",
      "format",
      "bookingUidToReschedule",
    ],
  },
);
const busyCalendarInputSchema = s.actionInput(
  {
    credentialId: s.integer("The credential ID of the calendar connection."),
    externalId: s.nonEmptyString("The provider-specific calendar identifier."),
  },
  ["credentialId", "externalId"],
  "A calendar selection used for busy-time lookup.",
);
const busyTimesInputSchema = s.object(
  "Input payload for retrieving busy times.",
  {
    timeZone: timeZoneField,
    loggedInUsersTz: s.string("The logged-in user's time zone used for client-side compatibility."),
    dateFrom: isoDateTimeField,
    dateTo: isoDateTimeField,
    calendarsToLoad: s.array("The connected calendars to inspect for busy times.", busyCalendarInputSchema),
  },
  { required: ["dateFrom", "dateTo", "calendarsToLoad"], optional: ["timeZone", "loggedInUsersTz"] },
);
const destinationCalendarInputSchema = s.object(
  "Input payload for updating the destination calendar.",
  {
    integration: s.nonEmptyString("The integration name of the destination calendar."),
    externalId: s.nonEmptyString("The provider-specific identifier of the destination calendar."),
    delegationCredentialId: s.string("The delegated credential ID to use for the destination calendar."),
  },
  { required: ["integration", "externalId"], optional: ["delegationCredentialId"] },
);
const bookingListInputSchema = s.object(
  "Input payload for listing bookings.",
  {
    status: s.string("Filter bookings by status."),
    attendeeEmail: s.string("Filter bookings by attendee email address."),
    eventTypeId: eventTypeIdField,
    eventTypeSlug: eventTypeSlugField,
    sortStart: sortDirectionField,
    sortEnd: sortDirectionField,
    afterStart: isoDateTimeField,
    beforeStart: isoDateTimeField,
    afterEnd: isoDateTimeField,
    beforeEnd: isoDateTimeField,
    limit: limitField,
    cursor: cursorField,
  },
  {
    optional: [
      "status",
      "attendeeEmail",
      "eventTypeId",
      "eventTypeSlug",
      "sortStart",
      "sortEnd",
      "afterStart",
      "beforeStart",
      "afterEnd",
      "beforeEnd",
      "limit",
      "cursor",
    ],
  },
);
const fetchAllBookingsInputSchema = s.object(
  "Compatibility input payload for listing bookings.",
  {
    skip: s.nonNegativeInteger("The number of bookings to skip before returning results."),
    take: s.integer("The maximum number of bookings to return.", { minimum: 1, maximum: 200 }),
    status: s.stringArray("The booking statuses to include."),
    teamId: teamIdField,
    teamsIds: s.nonEmptyString("A comma-separated list of team IDs to include."),
    sortStart: sortDirectionField,
    sortEnd: sortDirectionField,
    sortCreated: sortDirectionField,
    afterStart: isoDateTimeField,
    beforeEnd: isoDateTimeField,
    attendeeName: s.string("Filter bookings by attendee name."),
    attendeeEmail: s.string("Filter bookings by attendee email address."),
    eventTypeId: eventTypeIdField,
    eventTypeIds: s.nonEmptyString("A comma-separated list of event type IDs to include."),
  },
  {
    optional: [
      "skip",
      "take",
      "status",
      "teamId",
      "teamsIds",
      "sortStart",
      "sortEnd",
      "sortCreated",
      "afterStart",
      "beforeEnd",
      "attendeeName",
      "attendeeEmail",
      "eventTypeId",
      "eventTypeIds",
    ],
  },
);
const bookingUidInputSchema = s.actionInput(
  {
    bookingUid: bookingUidField,
  },
  ["bookingUid"],
  "Input payload for targeting a booking by UID.",
);
const attendeeInputSchema = s.object(
  "Input payload for adding an attendee to a booking.",
  {
    bookingUid: bookingUidField,
    name: s.nonEmptyString("The attendee's display name."),
    email: s.nonEmptyString("The attendee's email address."),
    timeZone: timeZoneField,
    phoneNumber: s.string("The attendee's phone number."),
    language: s.string("The attendee's preferred language."),
  },
  { required: ["bookingUid", "name", "email", "timeZone"], optional: ["phoneNumber", "language"] },
);
const createBookingInputSchema = s.object(
  "Input payload for creating a Cal.com booking.",
  {
    start: isoDateTimeField,
    attendee: rawObject("The primary attendee information."),
    eventTypeId: eventTypeIdField,
    eventTypeSlug: eventTypeSlugField,
    username: usernameField,
    teamSlug: teamSlugField,
    organizationSlug: organizationSlugField,
    bookingFieldsResponses: rawObject("The answers for custom booking form fields."),
    guests: s.stringArray("Additional guest email addresses."),
    meetingUrl: s.string("The meeting URL to attach to the booking."),
    location: rawObject("The location payload for the booking."),
    metadata: rawObject("Additional metadata to attach to the booking."),
    lengthInMinutes: s.positiveInteger("The requested booking duration in minutes."),
    routing: rawObject("Routing metadata for round-robin or collective bookings."),
    emailVerificationCode: s.string("The email verification code for protected bookings."),
    instant: s.boolean("Whether to request instant booking behavior."),
  },
  { required: ["start", "attendee"], additionalProperties: true },
);
const bookingReferencesInputSchema = s.object(
  "Input payload for listing booking references.",
  {
    bookingUid: bookingUidField,
    type: s.string("Filter references by reference type."),
  },
  { required: ["bookingUid"], optional: ["type"] },
);
const declineBookingInputSchema = s.object(
  "Input payload for declining a booking.",
  {
    bookingUid: bookingUidField,
    reason: s.string("The reason for declining the booking."),
  },
  { required: ["bookingUid"], optional: ["reason"] },
);
const markAbsentInputSchema = s.object(
  "Input payload for marking booking absence.",
  {
    bookingUid: bookingUidField,
    host: s.boolean("Whether to mark the booking host absent."),
    attendees: s.array(
      "The attendees whose absence status should be updated.",
      s.actionInput(
        {
          email: s.string("The attendee email address."),
          absent: s.boolean("Whether to mark this attendee absent."),
        },
        ["email", "absent"],
        "One attendee absence update.",
      ),
    ),
  },
  { required: ["bookingUid"], optional: ["host", "attendees"] },
);
const reassignBookingInputSchema = s.object(
  "Input payload for reassigning a round-robin booking.",
  {
    bookingUid: bookingUidField,
    userId: s.integer("The Cal.com user ID to reassign the booking to."),
    reason: s.string("The reason for reassigning the booking."),
  },
  { required: ["bookingUid", "userId"], optional: ["reason"] },
);
const cancelBookingInputSchema = s.object(
  "Input payload for cancelling a booking.",
  {
    bookingUid: bookingUidField,
    seatUid: s.string("The seat UID to cancel for seat-based bookings."),
    cancellationReason: s.string("The reason shown for cancelling the booking."),
    cancelSubsequentBookings: s.boolean("Whether subsequent recurring bookings should also be cancelled."),
  },
  { required: ["bookingUid"], optional: ["seatUid", "cancellationReason", "cancelSubsequentBookings"] },
);
const rescheduleBookingInputSchema = s.object(
  "Input payload for rescheduling a booking.",
  {
    bookingUid: bookingUidField,
    start: isoDateTimeField,
    rescheduledBy: s.string("The actor or source that initiated the reschedule."),
    reason: s.string("The reason for rescheduling the booking."),
    reschedulingReason: s.string("Compatibility reason field for rescheduling the booking."),
    emailVerificationCode: s.string("The email verification code required for protected bookings."),
  },
  {
    required: ["bookingUid", "start"],
    optional: ["rescheduledBy", "reason", "reschedulingReason", "emailVerificationCode"],
  },
);
const listSchedulesInputSchema = s.object(
  "Input payload for listing Cal.com schedules.",
  {
    limit: limitField,
    cursor: cursorField,
  },
  { optional: ["limit", "cursor"] },
);
const scheduleIdInputSchema = s.actionInput(
  {
    scheduleId: scheduleIdField,
  },
  ["scheduleId"],
  "Input payload for targeting a schedule.",
);
const availabilityRuleInputSchema = s.actionInput(
  {
    days: s.stringArray("The weekdays this availability block applies to."),
    startTime: s.nonEmptyString("The start time for the availability block."),
    endTime: s.nonEmptyString("The end time for the availability block."),
  },
  ["days", "startTime", "endTime"],
  "A weekly availability block.",
);
const overrideInputSchema = s.actionInput(
  {
    date: s.nonEmptyString("The date that the override applies to."),
    startTime: s.nonEmptyString("The start time for the override block."),
    endTime: s.nonEmptyString("The end time for the override block."),
  },
  ["date", "startTime", "endTime"],
  "A date-specific schedule override.",
);
const createScheduleInputSchema = s.object(
  "Input payload for creating a schedule.",
  {
    name: s.nonEmptyString("The display name of the schedule."),
    timeZone: timeZoneField,
    isDefault: s.boolean("Whether to make this the default schedule."),
    availability: s.array("The weekly availability rules for the schedule.", availabilityRuleInputSchema),
    overrides: s.array("The date-specific availability overrides.", overrideInputSchema),
  },
  { required: ["name", "timeZone", "availability"], optional: ["isDefault", "overrides"] },
);
const updateScheduleInputSchema = s.object(
  "Input payload for updating a schedule.",
  {
    scheduleId: scheduleIdField,
    name: s.string("The new display name of the schedule."),
    timeZone: timeZoneField,
    isDefault: s.boolean("Whether to make this the default schedule."),
    availability: s.array("The new weekly availability rules for the schedule.", availabilityRuleInputSchema),
    overrides: s.array("The new date-specific availability overrides.", overrideInputSchema),
  },
  { required: ["scheduleId"], optional: ["name", "timeZone", "isDefault", "availability", "overrides"] },
);

export type CalActionName =
  | "get_my_profile"
  | "retrieve_my_information"
  | "update_my_profile"
  | "update_user_profile_details"
  | "list_event_types"
  | "get_event_type"
  | "retrieve_event_type_by_id"
  | "fetch_event_type_details"
  | "create_event_type"
  | "update_event_type"
  | "delete_event_type"
  | "delete_event_type_by_id"
  | "get_event_type_private_links"
  | "get_available_slots_info"
  | "retrieve_calendar_list"
  | "retrieve_calendar_busy_times"
  | "update_destination_calendar_integration"
  | "list_bookings"
  | "fetch_all_bookings"
  | "get_booking"
  | "retrieve_booking_details_by_uid"
  | "create_booking"
  | "post_new_booking_request"
  | "list_attendees"
  | "add_attendee"
  | "list_booking_references"
  | "get_booking_references"
  | "confirm_booking_by_uid"
  | "decline_booking_with_reason"
  | "mark_booking_absent_for_uid"
  | "reassign_booking_with_uid"
  | "cancel_booking"
  | "cancel_booking_via_uid"
  | "reschedule_booking"
  | "reschedule_booking_by_uid"
  | "list_schedules"
  | "retrieve_schedules_list"
  | "get_schedule"
  | "fetch_schedule_by_id"
  | "create_schedule"
  | "create_user_availability_schedule"
  | "update_schedule"
  | "update_schedule_by_id"
  | "delete_schedule"
  | "delete_schedule_by_id"
  | "get_default_schedule"
  | "get_default_schedule_details";

function action(
  name: CalActionName,
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

export const calActions: ActionDefinition[] = [
  action(
    "get_my_profile",
    "read",
    "Get the current Cal.com user profile from the authenticated OAuth account.",
    emptyInputSchema,
    profileOutputSchema,
    profileRead,
  ),
  action(
    "retrieve_my_information",
    "read",
    "Compatibility alias for retrieving the authenticated Cal.com user's profile.",
    emptyInputSchema,
    profileOutputSchema,
    profileRead,
  ),
  action(
    "update_my_profile",
    "write",
    "Update the current Cal.com user's profile fields.",
    updateMyProfileInputSchema,
    profileOutputSchema,
    profileWrite,
  ),
  action(
    "update_user_profile_details",
    "write",
    "Compatibility alias for updating the authenticated Cal.com user's profile.",
    updateMyProfileInputSchema,
    profileOutputSchema,
    profileWrite,
  ),
  action(
    "list_event_types",
    "read",
    "List Cal.com event types for the authenticated user.",
    listEventTypesInputSchema,
    eventTypesOutputSchema,
    eventTypeRead,
  ),
  action(
    "get_event_type",
    "read",
    "Get a single Cal.com event type by numeric ID.",
    eventTypeLookupInputSchema,
    eventTypeOutputSchema,
    eventTypeRead,
  ),
  action(
    "retrieve_event_type_by_id",
    "read",
    "Compatibility alias for retrieving a Cal.com event type by ID.",
    looseEventTypeLookupInputSchema,
    eventTypeOutputSchema,
    eventTypeRead,
  ),
  action(
    "fetch_event_type_details",
    "read",
    "Compatibility alias for fetching a Cal.com event type by ID.",
    looseEventTypeLookupInputSchema,
    eventTypeOutputSchema,
    eventTypeRead,
  ),
  action(
    "create_event_type",
    "write",
    "Create a Cal.com event type for the authenticated user.",
    createEventTypeInputSchema,
    eventTypeOutputSchema,
    eventTypeWrite,
  ),
  action(
    "update_event_type",
    "write",
    "Update a Cal.com event type by numeric ID.",
    updateEventTypeInputSchema,
    eventTypeOutputSchema,
    eventTypeWrite,
  ),
  action(
    "delete_event_type",
    "destructive",
    "Delete a Cal.com event type by numeric ID.",
    eventTypeIdInputSchema,
    eventTypeOutputSchema,
    eventTypeWrite,
  ),
  action(
    "delete_event_type_by_id",
    "destructive",
    "Compatibility alias for deleting a Cal.com event type by ID.",
    eventTypeIdInputSchema,
    eventTypeOutputSchema,
    eventTypeWrite,
  ),
  action(
    "get_event_type_private_links",
    "read",
    "List private links configured for a Cal.com event type.",
    eventTypeIdInputSchema,
    privateLinksOutputSchema,
    eventTypeRead,
  ),
  action(
    "get_available_slots_info",
    "read",
    "Compatibility action returning available slots for a user, team, or event type.",
    slotsInputSchema,
    slotsOutputSchema,
    scheduleRead,
  ),
  action(
    "retrieve_calendar_list",
    "read",
    "Compatibility alias for listing connected calendars and the selected destination calendar.",
    emptyInputSchema,
    calendarListOutputSchema,
    scheduleRead,
  ),
  action(
    "retrieve_calendar_busy_times",
    "read",
    "Compatibility alias for returning busy ranges for specific calendars.",
    busyTimesInputSchema,
    busyTimesOutputSchema,
    scheduleRead,
  ),
  action(
    "update_destination_calendar_integration",
    "write",
    "Compatibility alias for updating the destination calendar used for created events.",
    destinationCalendarInputSchema,
    destinationCalendarOutputSchema,
    scheduleWrite,
  ),
  action(
    "list_bookings",
    "read",
    "List bookings for the authenticated Cal.com user.",
    bookingListInputSchema,
    bookingsOutputSchema,
    bookingRead,
  ),
  action(
    "fetch_all_bookings",
    "read",
    "Compatibility alias for listing bookings with optional filters and pagination.",
    fetchAllBookingsInputSchema,
    bookingsOutputSchema,
    bookingRead,
  ),
  action(
    "get_booking",
    "read",
    "Get a Cal.com booking by booking UID.",
    bookingUidInputSchema,
    bookingOutputSchema,
    bookingRead,
  ),
  action(
    "retrieve_booking_details_by_uid",
    "read",
    "Compatibility alias for getting a Cal.com booking by UID.",
    bookingUidInputSchema,
    bookingOutputSchema,
    bookingRead,
  ),
  action(
    "create_booking",
    "write",
    "Create a Cal.com booking.",
    createBookingInputSchema,
    bookingOutputSchema,
    bookingWrite,
  ),
  action(
    "post_new_booking_request",
    "write",
    "Compatibility alias for creating a Cal.com booking.",
    createBookingInputSchema,
    bookingOutputSchema,
    bookingWrite,
  ),
  action(
    "list_attendees",
    "read",
    "List attendees for a Cal.com booking by booking UID.",
    bookingUidInputSchema,
    attendeesOutputSchema,
    bookingRead,
  ),
  action(
    "add_attendee",
    "write",
    "Add an attendee to a Cal.com booking.",
    attendeeInputSchema,
    attendeeOutputSchema,
    bookingWrite,
  ),
  action(
    "list_booking_references",
    "read",
    "List booking references for a Cal.com booking.",
    bookingReferencesInputSchema,
    referencesOutputSchema,
    bookingRead,
  ),
  action(
    "get_booking_references",
    "read",
    "Compatibility alias for listing booking references.",
    bookingReferencesInputSchema,
    referencesOutputSchema,
    bookingRead,
  ),
  action(
    "confirm_booking_by_uid",
    "write",
    "Confirm a Cal.com booking by UID.",
    bookingUidInputSchema,
    bookingOutputSchema,
    bookingWrite,
  ),
  action(
    "decline_booking_with_reason",
    "destructive",
    "Decline a Cal.com booking by UID with an optional reason.",
    declineBookingInputSchema,
    bookingOutputSchema,
    bookingWrite,
  ),
  action(
    "mark_booking_absent_for_uid",
    "write",
    "Mark a Cal.com booking host or attendees absent.",
    markAbsentInputSchema,
    bookingOutputSchema,
    bookingWrite,
  ),
  action(
    "reassign_booking_with_uid",
    "write",
    "Reassign a round-robin booking to a specific host user ID.",
    reassignBookingInputSchema,
    resultOutputSchema,
    bookingWrite,
  ),
  action(
    "cancel_booking",
    "destructive",
    "Cancel a Cal.com booking by UID, optionally providing a cancellation reason.",
    cancelBookingInputSchema,
    bookingOutputSchema,
    bookingWrite,
  ),
  action(
    "cancel_booking_via_uid",
    "destructive",
    "Compatibility alias for cancelling a Cal.com booking by UID.",
    cancelBookingInputSchema,
    bookingOutputSchema,
    bookingWrite,
  ),
  action(
    "reschedule_booking",
    "write",
    "Reschedule a Cal.com booking by UID to a new start time.",
    rescheduleBookingInputSchema,
    bookingOutputSchema,
    bookingWrite,
  ),
  action(
    "reschedule_booking_by_uid",
    "write",
    "Compatibility alias for rescheduling a Cal.com booking by UID.",
    rescheduleBookingInputSchema,
    bookingOutputSchema,
    bookingWrite,
  ),
  action(
    "list_schedules",
    "read",
    "List schedules available to the authenticated Cal.com user.",
    listSchedulesInputSchema,
    schedulesOutputSchema,
    scheduleRead,
  ),
  action(
    "retrieve_schedules_list",
    "read",
    "Compatibility alias for listing schedules for the authenticated user.",
    emptyInputSchema,
    schedulesOutputSchema,
    scheduleRead,
  ),
  action(
    "get_schedule",
    "read",
    "Get a Cal.com schedule by numeric schedule ID.",
    scheduleIdInputSchema,
    scheduleOutputSchema,
    scheduleRead,
  ),
  action(
    "fetch_schedule_by_id",
    "read",
    "Compatibility alias for getting a Cal.com schedule by numeric ID.",
    scheduleIdInputSchema,
    scheduleOutputSchema,
    scheduleRead,
  ),
  action(
    "create_schedule",
    "write",
    "Create a schedule for the authenticated Cal.com user.",
    createScheduleInputSchema,
    scheduleOutputSchema,
    scheduleWrite,
  ),
  action(
    "create_user_availability_schedule",
    "write",
    "Compatibility alias for creating a Cal.com user availability schedule.",
    createScheduleInputSchema,
    scheduleOutputSchema,
    scheduleWrite,
  ),
  action(
    "update_schedule",
    "write",
    "Update a schedule for the authenticated Cal.com user.",
    updateScheduleInputSchema,
    scheduleOutputSchema,
    scheduleWrite,
  ),
  action(
    "update_schedule_by_id",
    "write",
    "Compatibility alias for updating a Cal.com schedule by ID.",
    updateScheduleInputSchema,
    scheduleOutputSchema,
    scheduleWrite,
  ),
  action(
    "delete_schedule",
    "destructive",
    "Delete a schedule for the authenticated Cal.com user.",
    scheduleIdInputSchema,
    successOutputSchema,
    scheduleWrite,
  ),
  action(
    "delete_schedule_by_id",
    "destructive",
    "Compatibility alias for deleting a Cal.com schedule by ID.",
    scheduleIdInputSchema,
    successOutputSchema,
    scheduleWrite,
  ),
  action(
    "get_default_schedule",
    "read",
    "Get the default schedule for the authenticated Cal.com user.",
    emptyInputSchema,
    scheduleOutputSchema,
    scheduleRead,
  ),
  action(
    "get_default_schedule_details",
    "read",
    "Compatibility alias for getting the authenticated user's default schedule.",
    emptyInputSchema,
    scheduleOutputSchema,
    scheduleRead,
  ),
];
