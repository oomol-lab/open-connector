import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "simplybook_me";

const serviceIdSchema = s.positiveInteger("The SimplyBook.me service event id.");
const performerIdSchema = s.positiveInteger("The SimplyBook.me performer unit id.");
const countSchema = s.positiveInteger("The booking count used for availability checks.");

const visibleListInputSchema = s.object(
  "Options for listing public SimplyBook.me records.",
  {
    isVisibleOnly: s.boolean("Whether to return only records visible on the public booking site."),
  },
  { optional: ["isVisibleOnly"] },
);

const availableUnitsInputSchema = s.object(
  "Input for finding performers available for one service and date-time.",
  {
    serviceId: serviceIdSchema,
    dateTime: s.nonEmptyString("The requested date and time in YYYY-MM-DD HH:mm:ss format."),
    count: countSchema,
  },
  { optional: ["count"] },
);

const startTimeMatrixInputSchema = s.object(
  "Input for querying available start times for one service and performer.",
  {
    from: s.date("The first date to include in YYYY-MM-DD format."),
    to: s.date("The last date to include in YYYY-MM-DD format."),
    serviceId: serviceIdSchema,
    performerId: performerIdSchema,
    count: countSchema,
  },
  { optional: ["count"] },
);

const companyInfoSchema = s.looseObject("The SimplyBook.me company information object.", {
  name: s.string("The company name returned by SimplyBook.me."),
  login: s.string("The company login returned by SimplyBook.me."),
  email: s.string("The company email returned by SimplyBook.me."),
  timezone: s.string("The company timezone returned by SimplyBook.me."),
});

const serviceSchema = s.looseObject("A SimplyBook.me service event object.", {
  id: s.string("The service event id returned by SimplyBook.me."),
  name: s.string("The service name returned by SimplyBook.me."),
  duration: s.string("The service duration returned by SimplyBook.me."),
  is_public: s.string("Whether the service is public in SimplyBook.me."),
  is_active: s.string("Whether the service is active in SimplyBook.me."),
});

const performerSchema = s.looseObject("A SimplyBook.me performer unit object.", {
  id: s.string("The performer unit id returned by SimplyBook.me."),
  name: s.string("The performer name returned by SimplyBook.me."),
  email: s.string("The performer email returned by SimplyBook.me."),
  is_active: s.string("Whether the performer is active in SimplyBook.me."),
});

const timeMatrixSchema = s.record(
  "Available start times keyed by date.",
  s.array("Start times returned for the date.", s.string("A start time in HH:mm:ss format.")),
);

export const simplybookMeActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_company_info",
    operationType: "read",
    description: "Get public company profile and configuration details from SimplyBook.me.",
    inputSchema: s.object("Input for fetching SimplyBook.me company information.", {}),
    outputSchema: s.requiredObject("The SimplyBook.me company information response.", {
      company: companyInfoSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_services",
    operationType: "read",
    description: "List SimplyBook.me public service events available for booking.",
    inputSchema: visibleListInputSchema,
    outputSchema: s.requiredObject("The SimplyBook.me service list response.", {
      services: s.array("Service events returned by SimplyBook.me.", serviceSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "list_performers",
    operationType: "read",
    description: "List SimplyBook.me service performers that can provide services.",
    inputSchema: visibleListInputSchema,
    outputSchema: s.requiredObject("The SimplyBook.me performer list response.", {
      performers: s.array("Performers returned by SimplyBook.me.", performerSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "get_available_units",
    operationType: "read",
    description: "Get performer ids available for a SimplyBook.me service at a specific date-time.",
    inputSchema: availableUnitsInputSchema,
    outputSchema: s.requiredObject("The SimplyBook.me available units response.", {
      performerIds: s.array(
        "Performer unit ids available for the requested slot.",
        s.integer("A SimplyBook.me performer unit id."),
      ),
    }),
  }),
  defineProviderAction(service, {
    name: "get_start_time_matrix",
    operationType: "read",
    description: "Get available SimplyBook.me start times for a service and performer over a date range.",
    inputSchema: startTimeMatrixInputSchema,
    outputSchema: s.requiredObject("The SimplyBook.me start time matrix response.", {
      timesByDate: timeMatrixSchema,
    }),
  }),
];
