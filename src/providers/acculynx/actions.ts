import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";
const service = "acculynx";
const trimmedString = (
  description: string,
  options?: {
    maxLength?: number;
    format?: string;
  },
) =>
  s.string({
    description,
    minLength: 1,
    maxLength: options?.maxLength,
    format: options?.format,
  });
const pageSizeField = s.integer({ description: "The number of items to return per page.", minimum: 1 });
const pageStartIndexField = s.integer({ description: "The zero-based index of the first item to return.", minimum: 0 });
const recordStartIndexField = s.integer({
  description: "The zero-based index of the first item to return.",
  minimum: 0,
});
const pageSummaryFields = {
  count: s.integer({ description: "The total number of unfiltered items." }),
  pageSize: s.integer({ description: "The requested or default page size." }),
  pageStartIndex: s.integer({ description: "The requested or default index of the first returned item." }),
};
const pagedResponseRequiredFields = ["count", "pageSize", "pageStartIndex", "items"];
const linkField = s.url("The canonical API URL for this resource.");
const companySettingsSchema = s.object(
  {
    id: s.uuid("The unique identifier of the company."),
    name: s.string({ description: "The company name." }),
    hasInsurance: s.boolean({ description: "Whether the company has insurance settings enabled." }),
    timeZoneInfo: s.object(
      {
        name: s.string({ description: "The standard timezone name." }),
        daylightName: s.string({ description: "The daylight saving timezone name." }),
        baseUtcOffset: s.string({ description: "The base UTC offset of the timezone." }),
        adjustedUtcOffset: s.string({ description: "The currently adjusted UTC offset of the timezone." }),
        supportsDaylightSavingTime: s.boolean({ description: "Whether the timezone supports daylight saving time." }),
      },
      { description: "The company timezone information.", required: ["name"] },
    ),
  },
  { description: "The current AccuLynx company settings.", required: ["id", "name"] },
);
const contactTypeSchema = s.object(
  {
    id: s.uuid("The unique identifier of the contact type."),
    name: s.string({ description: "The contact type name." }),
    isDefault: s.boolean({ description: "Whether this contact type is marked as the default." }),
  },
  { description: "One contact type available in the company.", required: ["id", "name", "isDefault"] },
);
const leadSourceChildSchema = s.object(
  {
    id: s.uuid("The unique identifier of the child lead source."),
    parentId: s.uuid("The unique identifier of the parent lead source."),
    name: s.string({ description: "The child lead source name." }),
    link: linkField,
  },
  { description: "One child lead source.", required: ["id", "parentId", "name", "link"] },
);
const leadSourceSchema = s.object(
  {
    id: s.uuid("The unique identifier of the lead source."),
    name: s.string({ description: "The lead source name." }),
    link: linkField,
    children: s.array(leadSourceChildSchema, { description: "The child lead sources when configured." }),
  },
  { description: "One lead source available in the company.", required: ["id", "name", "link"] },
);
const jobCategorySchema = s.object(
  {
    id: s.integer({ description: "The unique identifier of the job category." }),
    name: s.string({ description: "The job category name." }),
  },
  { description: "One job category available in the company.", required: ["id", "name"] },
);
const tradeTypeSchema = s.object(
  {
    id: s.uuid("The unique identifier of the trade type."),
    name: s.string({ description: "The trade type name." }),
  },
  { description: "One trade type available in the company.", required: ["id", "name"] },
);
const workTypeSchema = s.object(
  {
    id: s.integer({ description: "The unique identifier of the work type." }),
    name: s.string({ description: "The work type name." }),
    systemDefault: s.boolean({ description: "Whether the work type is a system default." }),
    link: linkField,
  },
  { description: "One work type available in the company.", required: ["id", "name", "systemDefault", "link"] },
);
const pagedContactTypesSchema = s.object(
  {
    ...pageSummaryFields,
    items: s.array(contactTypeSchema, { description: "The returned contact types." }),
  },
  { description: "A paginated contact type response.", required: pagedResponseRequiredFields },
);
const pagedLeadSourcesSchema = s.object(
  {
    ...pageSummaryFields,
    items: s.array(leadSourceSchema, { description: "The returned lead sources." }),
  },
  { description: "A paginated lead source response.", required: pagedResponseRequiredFields },
);
const pagedJobCategoriesSchema = s.object(
  {
    ...pageSummaryFields,
    items: s.array(jobCategorySchema, { description: "The returned job categories." }),
  },
  { description: "A paginated job category response.", required: pagedResponseRequiredFields },
);
const pagedTradeTypesSchema = s.object(
  {
    ...pageSummaryFields,
    items: s.array(tradeTypeSchema, { description: "The returned trade types." }),
  },
  { description: "A paginated trade type response.", required: pagedResponseRequiredFields },
);
const pagedWorkTypesSchema = s.object(
  {
    ...pageSummaryFields,
    items: s.array(workTypeSchema, { description: "The returned work types." }),
  },
  { description: "A paginated work type response.", required: pagedResponseRequiredFields },
);
const contactStateInputSchema = s.object(
  {
    id: s.integer({ description: "The unique identifier of the state." }),
  },
  { description: "The state reference used for a contact address.", required: ["id"] },
);
const contactCountryInputSchema = s.object(
  {
    id: s.integer({ description: "The unique identifier of the country." }),
  },
  { description: "The country reference used for a contact address.", required: ["id"] },
);
const contactAddressInputSchema = s.object(
  {
    street1: trimmedString("The first address line."),
    street2: trimmedString("The second address line."),
    city: trimmedString("The city name."),
    zipCode: trimmedString("The postal or ZIP code."),
    state: contactStateInputSchema,
    country: contactCountryInputSchema,
  },
  { description: "A contact address." },
);
const contactPhoneNumberInputSchema = s.object(
  {
    number: s.string({ description: "The 10 digit phone number.", minLength: 10, maxLength: 10, pattern: "^\\d{10}$" }),
    ext: trimmedString("The optional phone extension."),
    primary: s.boolean({ description: "Whether this phone number is the primary one." }),
    hasTextingAvailable: s.boolean({ description: "Whether SMS or texting is enabled for this phone number." }),
    type: s.stringEnum(["Home", "Mobile", "Work"], { description: "The classification of the phone number." }),
  },
  { description: "A contact phone number.", required: ["number", "type"] },
);
const contactEmailAddressInputSchema = s.object(
  {
    address: trimmedString("The contact email address.", { format: "email" }),
    primary: s.boolean({ description: "Whether this email address is the primary one." }),
    type: s.stringEnum(["Personal", "Work", "Other"], { description: "The classification of the email address." }),
  },
  { description: "A contact email address.", required: ["address"] },
);
const createContactInputSchema = s.object(
  {
    contactTypeIds: s.array(s.uuid("One contact type identifier."), {
      description: "The contact type identifiers assigned to the contact.",
      minItems: 1,
    }),
    firstName: trimmedString("The contact first name."),
    lastName: trimmedString("The contact last name."),
    crossReference: trimmedString("The external cross-reference stored on the contact."),
    companyName: trimmedString("The contact company name."),
    companyJobTitle: trimmedString("The contact job title."),
    note: trimmedString("A note stored on the contact."),
    phoneNumbers: s.array(contactPhoneNumberInputSchema, {
      description: "The phone numbers to create on the contact.",
      minItems: 1,
    }),
    emailAddresses: s.array(contactEmailAddressInputSchema, {
      description: "The email addresses to create on the contact.",
      minItems: 1,
    }),
    mailingAddress: contactAddressInputSchema,
    billingAddress: contactAddressInputSchema,
    billingAddressSameAsMailingAddress: s.boolean({
      description: "Whether the billing address should match the mailing address.",
    }),
  },
  { description: "The input payload for creating one AccuLynx contact.", required: ["contactTypeIds"] },
);
const createContactOutputSchema = s.object(
  {
    contact: s.object(
      {
        id: s.uuid("The unique identifier of the created contact."),
        link: linkField,
      },
      { description: "The created contact reference.", required: ["id", "link"] },
    ),
  },
  { description: "The created contact link returned by AccuLynx.", required: ["contact"] },
);
const contactReferenceInputSchema = s.object(
  {
    id: s.uuid("The unique identifier of the contact."),
  },
  { description: "The contact reference used by a job.", required: ["id"] },
);
const leadSourceReferenceInputSchema = s.object(
  {
    id: s.uuid("The unique identifier of the lead source."),
  },
  { description: "The lead source reference used by a job.", required: ["id"] },
);
const locationAddressInputSchema = s.object(
  {
    street1: trimmedString("The first address line.", { maxLength: 250 }),
    street2: trimmedString("The second address line.", { maxLength: 50 }),
    city: trimmedString("The city name.", { maxLength: 50 }),
    state: trimmedString("The state or province abbreviation.", { maxLength: 50 }),
    country: trimmedString("The country abbreviation.", { maxLength: 50 }),
    zipCode: trimmedString("The postal or ZIP code.", { maxLength: 50 }),
  },
  { description: "The job location address.", required: ["street1", "city", "state", "country", "zipCode"] },
);
const jobCategoryReferenceInputSchema = s.object(
  {
    id: s.integer({ description: "The unique identifier of the job category." }),
  },
  { description: "The job category reference.", required: ["id"] },
);
const workTypeReferenceInputSchema = s.object(
  {
    id: s.integer({ description: "The unique identifier of the work type." }),
  },
  { description: "The work type reference.", required: ["id"] },
);
const tradeTypeReferenceInputSchema = s.object(
  {
    id: s.uuid("The unique identifier of the trade type."),
  },
  { description: "The trade type reference.", required: ["id"] },
);
const createJobInputSchema = s.object(
  {
    contact: contactReferenceInputSchema,
    leadSource: leadSourceReferenceInputSchema,
    locationAddress: locationAddressInputSchema,
    priority: s.stringEnum(["Urgent", "High", "Normal"], { description: "The priority assigned to the job." }),
    jobCategory: jobCategoryReferenceInputSchema,
    workType: workTypeReferenceInputSchema,
    tradeTypes: s.array(tradeTypeReferenceInputSchema, {
      description: "The trade types assigned to the job.",
      minItems: 1,
    }),
    notes: trimmedString("A note stored on the newly created job.", { maxLength: 1000 }),
  },
  { description: "The input payload for creating one AccuLynx job.", required: ["contact"] },
);
const createJobOutputSchema = s.object(
  {
    job: s.object(
      {
        id: s.uuid("The unique identifier of the created job."),
        link: linkField,
      },
      { description: "The created job reference.", required: ["id", "link"] },
    ),
  },
  { description: "The created job link returned by AccuLynx.", required: ["job"] },
);
const calendarSchema = s.object(
  {
    id: s.uuid("The unique identifier of the calendar."),
    name: s.string({ description: "The calendar name." }),
  },
  { description: "One calendar returned by AccuLynx.", required: ["id", "name"] },
);
const pagedCalendarsSchema = s.object(
  {
    ...pageSummaryFields,
    items: s.array(calendarSchema, { description: "The returned calendars." }),
  },
  { description: "A paginated calendar response.", required: pagedResponseRequiredFields },
);
const calendarAppointmentSchema = s.object(
  {
    id: s.uuid("The unique identifier of the appointment."),
    title: s.string({ description: "The appointment title." }),
    start: s.dateTime("The appointment start datetime in ISO 8601 format."),
    end: s.dateTime("The appointment end datetime in ISO 8601 format."),
    allDay: s.boolean({ description: "Whether the appointment lasts all day." }),
    jobId: s.uuid("The related job identifier."),
    jobName: s.string({ description: "The related job name." }),
    location: s.string({ description: "The appointment location." }),
    notes: s.string({ description: "The notes attached to the appointment." }),
    eventType: s.string({ description: "The appointment event type." }),
    link: linkField,
  },
  { description: "One calendar appointment summary.", required: ["id", "title", "start", "end", "allDay", "link"] },
);
const pagedCalendarAppointmentsSchema = s.object(
  {
    ...pageSummaryFields,
    items: s.array(calendarAppointmentSchema, { description: "The returned appointment summaries." }),
  },
  { description: "A paginated calendar appointment response.", required: pagedResponseRequiredFields },
);
const initialAppointmentSchema = s.object(
  {
    link: linkField,
    startDate: s.dateTime("The start datetime of the initial appointment."),
    endDate: s.dateTime("The end datetime of the initial appointment."),
    notes: s.string({ description: "The notes stored on the initial appointment." }),
  },
  { description: "The initial appointment for one job.", required: ["link"] },
);
const initialAppointmentOutputSchema = s.object(
  {
    initialAppointment: initialAppointmentSchema,
  },
  { description: "The initial appointment wrapper returned by the connector.", required: ["initialAppointment"] },
);
export const acculynxActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_company_settings",
    operationType: "read",
    description: "Get the current AccuLynx company settings for the connected location.",
    requiredScopes: [],
    inputSchema: s.object({}, { description: "The input payload for loading company settings." }),
    outputSchema: companySettingsSchema,
  }),
  defineProviderAction(service, {
    name: "list_contact_types",
    operationType: "read",
    description: "List the contact types configured for the current AccuLynx company.",
    requiredScopes: [],
    inputSchema: s.object(
      {
        pageSize: pageSizeField,
        pageStartIndex: pageStartIndexField,
      },
      { description: "The input payload for listing contact types." },
    ),
    outputSchema: pagedContactTypesSchema,
  }),
  defineProviderAction(service, {
    name: "list_lead_sources",
    operationType: "read",
    description: "List the active lead sources configured for the current AccuLynx company.",
    requiredScopes: [],
    inputSchema: s.object(
      {
        pageSize: pageSizeField,
        recordStartIndex: recordStartIndexField,
      },
      { description: "The input payload for listing lead sources." },
    ),
    outputSchema: pagedLeadSourcesSchema,
  }),
  defineProviderAction(service, {
    name: "list_job_categories",
    operationType: "read",
    description: "List the active AccuLynx job categories configured for the company.",
    requiredScopes: [],
    inputSchema: s.object(
      {
        pageSize: pageSizeField,
        recordStartIndex: recordStartIndexField,
      },
      { description: "The input payload for listing job categories." },
    ),
    outputSchema: pagedJobCategoriesSchema,
  }),
  defineProviderAction(service, {
    name: "list_trade_types",
    operationType: "read",
    description: "List the active AccuLynx trade types configured for the company.",
    requiredScopes: [],
    inputSchema: s.object(
      {
        pageSize: pageSizeField,
        recordStartIndex: recordStartIndexField,
      },
      { description: "The input payload for listing trade types." },
    ),
    outputSchema: pagedTradeTypesSchema,
  }),
  defineProviderAction(service, {
    name: "list_work_types",
    operationType: "read",
    description: "List the active AccuLynx work types configured for the company.",
    requiredScopes: [],
    inputSchema: s.object(
      {
        pageSize: pageSizeField,
        recordStartIndex: recordStartIndexField,
      },
      { description: "The input payload for listing work types." },
    ),
    outputSchema: pagedWorkTypesSchema,
  }),
  defineProviderAction(service, {
    name: "create_contact",
    operationType: "write",
    description: "Create one new contact in AccuLynx.",
    requiredScopes: [],
    inputSchema: createContactInputSchema,
    outputSchema: createContactOutputSchema,
  }),
  defineProviderAction(service, {
    name: "create_job",
    operationType: "write",
    description: "Create one new job in the AccuLynx Lead milestone.",
    requiredScopes: [],
    inputSchema: createJobInputSchema,
    outputSchema: createJobOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_calendars",
    operationType: "read",
    description: "List the calendars available in the current AccuLynx location.",
    requiredScopes: [],
    inputSchema: s.object(
      {
        pageSize: pageSizeField,
        recordStartIndex: recordStartIndexField,
      },
      { description: "The input payload for listing calendars." },
    ),
    outputSchema: pagedCalendarsSchema,
  }),
  defineProviderAction(service, {
    name: "list_calendar_appointments",
    operationType: "read",
    description: "List appointment summaries for one AccuLynx calendar within a date range.",
    requiredScopes: [],
    inputSchema: s.object(
      {
        calendarId: s.uuid("The unique identifier of the calendar."),
        pageSize: pageSizeField,
        pageStartIndex: pageStartIndexField,
        startDate: s.date("The inclusive start date in YYYY-MM-DD format."),
        endDate: s.date("The inclusive end date in YYYY-MM-DD format."),
      },
      {
        description: "The input payload for listing calendar appointments.",
        required: ["calendarId", "startDate", "endDate"],
      },
    ),
    outputSchema: pagedCalendarAppointmentsSchema,
  }),
  defineProviderAction(service, {
    name: "get_initial_appointment",
    operationType: "read",
    description: "Get the initial appointment for one AccuLynx job.",
    requiredScopes: [],
    inputSchema: s.object(
      {
        jobId: s.uuid("The unique identifier of the job."),
      },
      { description: "The input payload for loading one job initial appointment.", required: ["jobId"] },
    ),
    outputSchema: initialAppointmentOutputSchema,
  }),
  defineProviderAction(service, {
    name: "upsert_initial_appointment",
    operationType: "write",
    description: "Add or update the initial appointment for one AccuLynx job.",
    requiredScopes: [],
    inputSchema: s.object(
      {
        jobId: s.uuid("The unique identifier of the job."),
        startDate: s.dateTime("The appointment start datetime in UTC ISO 8601 format."),
        endDate: s.dateTime("The appointment end datetime in UTC ISO 8601 format."),
        notes: s.string({ description: "The notes stored on the initial appointment." }),
      },
      {
        description: "The input payload for adding or updating one job initial appointment.",
        required: ["jobId", "startDate"],
      },
    ),
    outputSchema: initialAppointmentOutputSchema,
  }),
];
