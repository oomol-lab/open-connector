import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "acuity_scheduling" as const;

const idSchema = s.positiveInteger("The numeric Acuity Scheduling resource ID.");
const addonIdsSchema = s.array(
  "The add-on IDs to include for this appointment or availability query.",
  s.positiveInteger("One numeric Acuity Scheduling add-on ID."),
);
const intakeFieldSchema = s.object("One intake form answer submitted with an appointment.", {
  id: s.positiveInteger("The numeric Acuity Scheduling intake field ID."),
  value: s.string("The answer submitted for the intake field."),
});
const labelSchema = s.object("One label applied to the appointment.", {
  id: s.positiveInteger("The numeric Acuity Scheduling label ID."),
});
const labelsSchema = s.array(
  "The label applied to the appointment. Acuity currently accepts at most one label.",
  labelSchema,
  { maxItems: 1 },
);

const accountSchema = s.object("A normalized Acuity Scheduling account.", {
  id: idSchema,
  name: s.nullable(s.string("The account display name when returned by Acuity.")),
  email: s.nullable(s.string("The account email address when returned by Acuity.")),
  timezone: s.nullable(s.string("The account timezone when returned by Acuity.")),
  currency: s.nullable(s.string("The account currency code when returned by Acuity.")),
  schedulingPage: s.nullable(s.string("The public scheduling page URL when returned by Acuity.")),
  plan: s.nullable(s.string("The Acuity subscription plan when returned.")),
  raw: s.looseObject("The raw account object returned by Acuity Scheduling."),
});

const calendarSchema = s.object("A normalized Acuity Scheduling calendar.", {
  id: idSchema,
  name: s.string("The calendar name."),
  email: s.nullable(s.string("The calendar notification email when returned.")),
  timezone: s.nullable(s.string("The calendar timezone when returned.")),
  description: s.nullable(s.string("The calendar description when returned.")),
  raw: s.looseObject("The raw calendar object returned by Acuity Scheduling."),
});

const appointmentTypeSchema = s.object("A normalized Acuity Scheduling appointment type.", {
  id: idSchema,
  name: s.string("The appointment type name."),
  duration: s.nullable(s.integer("The appointment duration in minutes when returned.")),
  price: s.nullable(s.string("The appointment price as returned by Acuity.")),
  category: s.nullable(s.string("The appointment type category when returned.")),
  active: s.nullable(s.boolean("Whether the appointment type is active when returned.")),
  raw: s.looseObject("The raw appointment type object returned by Acuity Scheduling."),
});

const intakeFormSchema = s.object("A normalized Acuity Scheduling intake form.", {
  id: idSchema,
  name: s.string("The intake form name."),
  description: s.nullable(s.string("The intake form description when returned.")),
  fields: s.array(
    "The raw field definitions included in the intake form.",
    s.looseObject("One raw Acuity Scheduling intake field definition."),
  ),
  raw: s.looseObject("The raw intake form object returned by Acuity Scheduling."),
});

const appointmentSchema = s.object("A normalized Acuity Scheduling appointment.", {
  id: idSchema,
  firstName: s.nullable(s.string("The client first name when returned.")),
  lastName: s.nullable(s.string("The client last name when returned.")),
  email: s.nullable(s.string("The client email address when returned.")),
  phone: s.nullable(s.string("The client phone number when returned.")),
  datetime: s.nullable(s.string("The appointment date and time when returned.")),
  date: s.nullable(s.string("The appointment date when returned.")),
  time: s.nullable(s.string("The appointment start time when returned.")),
  endTime: s.nullable(s.string("The appointment end time when returned.")),
  timezone: s.nullable(s.string("The appointment timezone when returned.")),
  type: s.nullable(s.string("The appointment type name when returned.")),
  appointmentTypeId: s.nullable(s.integer("The numeric appointment type ID when returned.")),
  calendar: s.nullable(s.string("The calendar name when returned.")),
  calendarId: s.nullable(s.integer("The numeric calendar ID when returned.")),
  duration: s.nullable(s.integer("The appointment duration in minutes when returned.")),
  canceled: s.boolean("Whether the appointment is canceled."),
  noShow: s.boolean("Whether the appointment is marked as a no-show."),
  notes: s.nullable(s.string("The appointment notes when returned.")),
  labels: s.array("The labels returned for the appointment.", s.unknown("One label value.")),
  forms: s.array(
    "The intake form answers returned for the appointment.",
    s.looseObject("One raw intake form answer object."),
  ),
  raw: s.looseObject("The raw appointment object returned by Acuity Scheduling."),
});

const availabilityBaseProperties = {
  appointmentTypeId: s.positiveInteger("The appointment type ID used to check availability."),
  calendarId: s.positiveInteger("The calendar ID used to limit availability."),
  addonIds: addonIdsSchema,
  timezone: s.nonEmptyString("The timezone used to return available dates and times."),
};

const appointmentWriteProperties = {
  firstName: s.nonEmptyString("The client first name."),
  lastName: s.nonEmptyString("The client last name."),
  email: s.email("The client email address."),
  phone: s.nonEmptyString("The client phone number."),
  certificate: s.nonEmptyString("The package, coupon, or gift certificate code to redeem."),
  fields: s.array("The intake form answers submitted with the appointment.", intakeFieldSchema),
  notes: s.string("Administrative notes attached to the appointment."),
  labels: labelsSchema,
  smsOptIn: s.boolean("Whether the client opts in to Acuity SMS notifications."),
};

const requestControlProperties = {
  admin: s.boolean("Whether Acuity should apply administrative scheduling privileges."),
  noEmail: s.boolean("Whether Acuity should suppress appointment email and SMS notifications."),
};

const createAppointmentInputSchema: JsonSchema = {
  ...s.object(
    "The appointment details submitted to Acuity Scheduling.",
    {
      datetime: s.nonEmptyString("The appointment start date and time."),
      appointmentTypeId: s.positiveInteger("The numeric appointment type ID."),
      calendarId: s.positiveInteger("The numeric appointment calendar ID."),
      timezone: s.nonEmptyString("The appointment timezone."),
      addonIds: addonIdsSchema,
      ...appointmentWriteProperties,
      ...requestControlProperties,
    },
    {
      optional: [
        "calendarId",
        "timezone",
        "addonIds",
        "email",
        "phone",
        "certificate",
        "fields",
        "notes",
        "labels",
        "smsOptIn",
        "admin",
        "noEmail",
      ],
    },
  ),
  allOf: [
    { if: { properties: { admin: { const: true } }, required: ["admin"] }, then: { required: ["calendarId"] } },
    { if: { not: { properties: { admin: { const: true } }, required: ["admin"] } }, then: { required: ["email"] } },
    { if: { required: ["notes"] }, then: { properties: { admin: { const: true } }, required: ["admin"] } },
  ],
};

const updateAppointmentInputSchema: JsonSchema = {
  ...s.object(
    "The fields used to update an Acuity appointment.",
    {
      appointmentId: s.positiveInteger("The numeric appointment ID to update."),
      ...appointmentWriteProperties,
      email: s.anyOf("The client email address, or an empty string when admin is true.", [
        s.email("The replacement client email address."),
        s.literal("", { description: "An empty value that removes the client email address." }),
      ]),
      phone: s.string("The client phone number, or an empty string when admin is true."),
      admin: requestControlProperties.admin,
    },
    {
      optional: [
        "firstName",
        "lastName",
        "email",
        "phone",
        "certificate",
        "fields",
        "notes",
        "labels",
        "smsOptIn",
        "admin",
      ],
    },
  ),
  allOf: [
    ...["certificate", "notes"].map((field) => ({
      if: { required: [field] },
      then: { properties: { admin: { const: true } }, required: ["admin"] },
    })),
    ...["email", "phone"].map((field) => ({
      if: { properties: { [field]: { const: "" } }, required: [field] },
      then: { properties: { admin: { const: true } }, required: ["admin"] },
    })),
  ],
};

const cancelAppointmentInputSchema: JsonSchema = {
  ...s.object(
    "The fields used to cancel an Acuity appointment.",
    {
      appointmentId: s.positiveInteger("The numeric appointment ID to cancel."),
      cancelNote: s.string("The message sent with cancellation notifications."),
      noShow: s.boolean("Whether the cancellation should mark the client as a no-show."),
      ...requestControlProperties,
    },
    { optional: ["cancelNote", "noShow", "admin", "noEmail"] },
  ),
  allOf: [{ if: { required: ["noShow"] }, then: { properties: { admin: { const: true } }, required: ["admin"] } }],
};

export const acuitySchedulingActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_account",
    description: "Retrieve the Acuity Scheduling account associated with the credential.",
    requiredScopes: [],
    inputSchema: s.object("The input payload for retrieving the Acuity account.", {}),
    outputSchema: s.object("The normalized Acuity account response.", { account: accountSchema }),
  }),
  defineProviderAction(service, {
    name: "list_calendars",
    description: "List calendars configured in the Acuity Scheduling account.",
    requiredScopes: [],
    inputSchema: s.object("The input payload for listing Acuity calendars.", {}),
    outputSchema: s.object("The normalized Acuity calendar list.", {
      calendars: s.array("Calendars returned by Acuity Scheduling.", calendarSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "list_appointment_types",
    description: "List appointment types configured in Acuity Scheduling.",
    requiredScopes: [],
    inputSchema: s.object(
      "The input payload for listing Acuity appointment types.",
      {
        includeDeleted: s.boolean("Whether deleted appointment types should be included."),
      },
      { optional: ["includeDeleted"] },
    ),
    outputSchema: s.object("The normalized Acuity appointment type list.", {
      appointmentTypes: s.array("Appointment types returned by Acuity Scheduling.", appointmentTypeSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "list_intake_forms",
    description: "List intake forms configured in Acuity Scheduling.",
    requiredScopes: [],
    inputSchema: s.object("The input payload for listing Acuity intake forms.", {}),
    outputSchema: s.object("The normalized Acuity intake form list.", {
      forms: s.array("Intake forms returned by Acuity Scheduling.", intakeFormSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "list_available_dates",
    description: "List available Acuity Scheduling dates for a month and appointment type.",
    requiredScopes: [],
    inputSchema: s.object(
      "The input payload for listing available Acuity dates.",
      {
        month: s.nonEmptyString("The month to query in YYYY-MM format."),
        ...availabilityBaseProperties,
      },
      { optional: ["calendarId", "addonIds", "timezone"] },
    ),
    outputSchema: s.object("The normalized available date list.", {
      dates: s.array(
        "Available dates returned by Acuity Scheduling.",
        s.date("One available date in YYYY-MM-DD format."),
      ),
    }),
  }),
  defineProviderAction(service, {
    name: "list_available_times",
    description: "List available Acuity Scheduling times for a date and appointment type.",
    requiredScopes: [],
    inputSchema: s.object(
      "The input payload for listing available Acuity times.",
      {
        date: s.date("The date to query in YYYY-MM-DD format."),
        ...availabilityBaseProperties,
        ignoreAppointmentIds: s.array(
          "Appointment IDs Acuity should ignore while checking availability.",
          s.positiveInteger("One numeric appointment ID to ignore."),
        ),
      },
      { optional: ["calendarId", "addonIds", "timezone", "ignoreAppointmentIds"] },
    ),
    outputSchema: s.object("The normalized available time list.", {
      times: s.array(
        "Available times returned by Acuity Scheduling.",
        s.string("One available appointment date and time."),
      ),
    }),
  }),
  defineProviderAction(service, {
    name: "list_appointments",
    description: "List Acuity Scheduling appointments with optional client and date filters.",
    requiredScopes: [],
    inputSchema: s.object(
      "The filters used to list Acuity appointments.",
      {
        max: s.positiveInteger("The maximum number of appointments to return."),
        minDate: s.date("The earliest appointment date to return."),
        maxDate: s.date("The latest appointment date to return."),
        calendarId: s.positiveInteger("The calendar ID used to filter appointments."),
        appointmentTypeId: s.positiveInteger("The appointment type ID used to filter appointments."),
        canceled: s.boolean("Whether to return canceled appointments."),
        showAll: s.boolean("Whether to return both scheduled and canceled appointments."),
        firstName: s.nonEmptyString("The client first name used to filter appointments."),
        lastName: s.nonEmptyString("The client last name used to filter appointments."),
        email: s.email("The client email used to filter appointments."),
        phone: s.nonEmptyString("The client phone number used to filter appointments."),
        excludeForms: s.boolean("Whether intake form answers should be omitted."),
        direction: s.stringEnum("The chronological sort direction.", ["ASC", "DESC"]),
      },
      {
        optional: [
          "max",
          "minDate",
          "maxDate",
          "calendarId",
          "appointmentTypeId",
          "canceled",
          "showAll",
          "firstName",
          "lastName",
          "email",
          "phone",
          "excludeForms",
          "direction",
        ],
      },
    ),
    outputSchema: s.object("The normalized Acuity appointment list.", {
      appointments: s.array("Appointments returned by Acuity Scheduling.", appointmentSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "get_appointment",
    description: "Retrieve one Acuity Scheduling appointment by ID.",
    requiredScopes: [],
    inputSchema: s.object(
      "The input payload for retrieving an Acuity appointment.",
      {
        appointmentId: s.positiveInteger("The numeric Acuity Scheduling appointment ID."),
        pastFormAnswers: s.boolean("Whether previous intake form answers should be included."),
      },
      { optional: ["pastFormAnswers"] },
    ),
    outputSchema: s.object("The normalized Acuity appointment response.", {
      appointment: appointmentSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "create_appointment",
    description: "Create an appointment in Acuity Scheduling.",
    requiredScopes: [],
    inputSchema: createAppointmentInputSchema,
    outputSchema: s.object("The normalized created Acuity appointment.", {
      appointment: appointmentSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "update_appointment",
    description: "Update client details, forms, notes, or labels on an Acuity appointment.",
    requiredScopes: [],
    inputSchema: updateAppointmentInputSchema,
    outputSchema: s.object("The normalized updated Acuity appointment.", {
      appointment: appointmentSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "reschedule_appointment",
    description: "Reschedule an Acuity appointment to a new date and time.",
    requiredScopes: [],
    inputSchema: s.object(
      "The fields used to reschedule an Acuity appointment.",
      {
        appointmentId: s.positiveInteger("The numeric appointment ID to reschedule."),
        datetime: s.nonEmptyString("The new appointment start date and time."),
        calendarId: s.nullable(
          s.positiveInteger("The new calendar ID, or null to let Acuity choose an available calendar."),
        ),
        timezone: s.nonEmptyString("The timezone for the new appointment time."),
        ...requestControlProperties,
      },
      { optional: ["calendarId", "timezone", "admin", "noEmail"] },
    ),
    outputSchema: s.object("The normalized rescheduled Acuity appointment.", {
      appointment: appointmentSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "cancel_appointment",
    description: "Cancel an Acuity Scheduling appointment.",
    requiredScopes: [],
    inputSchema: cancelAppointmentInputSchema,
    outputSchema: s.object("The normalized canceled Acuity appointment.", {
      appointment: appointmentSchema,
    }),
  }),
];
