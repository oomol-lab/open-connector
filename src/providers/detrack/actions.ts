import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "detrack";

const jobTypeSchema = s.stringEnum("The Detrack job type.", ["Delivery", "Collection"]);

const paginationLinksSchema = s.looseObject("Pagination links returned by Detrack.", {
  first: s.nullable(s.url("URL of the first result page.")),
  last: s.nullable(s.url("URL of the last result page.")),
  next: s.nullable(s.url("URL of the next result page.")),
  prev: s.nullable(s.url("URL of the previous result page.")),
});

const jobItemInputSchema = s.object(
  "An item attached to a Detrack delivery or collection job.",
  {
    sku: s.nonEmptyString("The stock keeping unit of the item."),
    purchaseOrderNumber: s.string("The purchase order number of the item."),
    batchNumber: s.string("The batch number of the item."),
    expiryDate: s.date("The item expiry date in YYYY-MM-DD format."),
    description: s.string("A description of the item."),
    comments: s.string("Free-form comments about the item."),
    quantity: s.integer("The planned quantity of the item."),
    unitOfMeasure: s.string("The unit of measure for the item."),
    weight: s.integer("The planned weight of the item."),
    serialNumbers: s.array("Serial numbers assigned to the item.", s.string("An item serial number.")),
  },
  {
    optional: [
      "sku",
      "purchaseOrderNumber",
      "batchNumber",
      "expiryDate",
      "description",
      "comments",
      "quantity",
      "unitOfMeasure",
      "weight",
      "serialNumbers",
    ],
  },
);

const mutableJobFields = {
  address: s.nonEmptyString("The address where the job is performed."),
  startDate: s.date("The date when the job starts in YYYY-MM-DD format."),
  timeWindowFrom: s.string("The beginning of the requested job time window."),
  timeWindowTo: s.string("The end of the requested job time window."),
  jobTime: s.string("The estimated duration needed to complete the job."),
  trackingNumber: s.string("The tracking number associated with the job."),
  orderNumber: s.string("The customer order number associated with the job."),
  addressLatitude: s.number("The latitude of the job address."),
  addressLongitude: s.number("The longitude of the job address."),
  companyName: s.string("The company name at the job address."),
  addressLine1: s.string("The first structured address line."),
  addressLine2: s.string("The second structured address line."),
  addressLine3: s.string("The third structured address line."),
  postalCode: s.string("The postal code of the job address."),
  city: s.string("The city of the job address."),
  state: s.string("The state or province of the job address."),
  country: s.string("The country of the job address."),
  contactName: s.string("The person receiving the delivery or providing the collection."),
  phoneNumber: s.string("The contact phone number for the job."),
  instructions: s.string("Instructions for the assigned driver."),
  assignTo: s.string("The driver or vehicle assignment name."),
  notifyEmail: s.nonEmptyString("One notification email address or multiple addresses separated by semicolons."),
  webhookUrl: s.url("The webhook URL associated with this job."),
  zone: s.string("The operational zone assigned to the job."),
  customer: s.string("The customer name associated with the job."),
  accountNumber: s.string("The customer account number associated with the job."),
  invoiceNumber: s.string("The invoice number associated with the job."),
  invoiceAmount: s.number("The invoice amount associated with the job."),
  groupName: s.string("The Detrack group assigned to the job."),
  weight: s.number("The planned total job weight."),
  boxes: s.string("A description of the boxes for the job."),
  cartons: s.integer("The planned number of cartons."),
  pieces: s.integer("The planned number of pieces."),
  pallets: s.integer("The planned number of pallets."),
  runNumber: s.string("The run number assigned to the job."),
  remarks: s.string("Free-form remarks associated with the job."),
  serviceType: s.string("The service type assigned to the job."),
  vehicleType: s.string("The vehicle type required for the job."),
  items: s.array("Items attached to the job.", jobItemInputSchema),
};

const listJobsInputSchema = s.object(
  "Filters and pagination for listing Detrack jobs.",
  {
    page: s.integer("The one-based result page number.", { minimum: 1 }),
    limit: s.integer("The number of jobs per page, up to the documented maximum of 100.", {
      minimum: 1,
      maximum: 100,
    }),
    sort: s.string("The upstream field to sort by, prefixed with a minus sign for descending order."),
    type: jobTypeSchema,
    date: s.date("The job date to filter by in YYYY-MM-DD format."),
    assignTo: s.string("The driver or vehicle assignment name to filter by."),
    status: s.string("One status or a comma-separated list of Detrack job statuses to filter by."),
    doNumber: s.string("The D.O. number to filter by."),
    query: s.string(
      "Text to search across D.O. number, address, contact, email, assignment, tracking number, and zone.",
    ),
  },
  {
    optional: ["page", "limit", "sort", "type", "date", "assignTo", "status", "doNumber", "query"],
  },
);

const createJobInputSchema = s.object(
  "The input payload for creating a Detrack job.",
  {
    type: jobTypeSchema,
    doNumber: s.nonEmptyString(
      "The D.O. number for the job. Detrack may allow automatic generation when configured, but this action requires an explicit stable identifier.",
    ),
    date: s.date("The date when the job is performed in YYYY-MM-DD format."),
    ...mutableJobFields,
  },
  { required: ["doNumber", "date"] },
);

const jobIdentityInputSchema = s.object(
  "The identity of one Detrack job.",
  {
    doNumber: s.nonEmptyString("The D.O. number of the job."),
    date: s.date("The job date in YYYY-MM-DD format."),
    type: jobTypeSchema,
  },
  { optional: ["type"] },
);

const updateJobInputSchema = s.object(
  "The identity and fields to update on a Detrack job.",
  {
    doNumber: s.nonEmptyString("The D.O. number of the job."),
    date: s.date("The current job date in YYYY-MM-DD format."),
    type: jobTypeSchema,
    ...mutableJobFields,
  },
  { required: ["doNumber", "date"] },
);

const namedSearchValueSchema = s.requiredObject("A named Detrack search selector.", {
  name: s.nonEmptyString("The exact Detrack group or vehicle name."),
});

const searchJobsInputSchema = s.object(
  "Structured filters and pagination for searching Detrack jobs.",
  {
    type: jobTypeSchema,
    doNumber: s.string("One D.O. number to match."),
    doNumbers: s.array("D.O. numbers to match.", s.nonEmptyString("A D.O. number to match."), {
      minItems: 1,
    }),
    dateFrom: s.date("The first job date to include in YYYY-MM-DD format."),
    dateTo: s.date("The last job date to include in YYYY-MM-DD format."),
    startDateFrom: s.date("The first job start date to include in YYYY-MM-DD format."),
    startDateTo: s.date("The last job start date to include in YYYY-MM-DD format."),
    statuses: s.array("Job statuses to include.", s.nonEmptyString("A Detrack job status."), {
      minItems: 1,
    }),
    groups: s.array("Groups to include.", namedSearchValueSchema, { minItems: 1 }),
    vehicles: s.array("Vehicles to include.", namedSearchValueSchema, { minItems: 1 }),
    accountNumber: s.string("The account number to match."),
    address: s.string("Address text to match."),
    contactName: s.string("Contact name to match."),
    customer: s.string("Customer name to match."),
    department: s.string("Department to match."),
    invoiceNumber: s.string("Invoice number to match."),
    jobType: s.string("Custom job type to match."),
    openToMarketplace: s.boolean("Whether to match jobs open to the marketplace."),
    orderNumber: s.string("Order number to match."),
    runNumber: s.string("Run number to match."),
    trackingNumber: s.string("Tracking number to match."),
    zone: s.string("Zone to match."),
    page: s.integer("The one-based result page number.", { minimum: 1 }),
    limit: s.integer("The number of jobs per page, up to the documented maximum of 100.", {
      minimum: 1,
      maximum: 100,
    }),
  },
  {
    optional: [
      "type",
      "doNumber",
      "doNumbers",
      "dateFrom",
      "dateTo",
      "startDateFrom",
      "startDateTo",
      "statuses",
      "groups",
      "vehicles",
      "accountNumber",
      "address",
      "contactName",
      "customer",
      "department",
      "invoiceNumber",
      "jobType",
      "openToMarketplace",
      "orderNumber",
      "runNumber",
      "trackingNumber",
      "zone",
      "page",
      "limit",
    ],
  },
);

const listDepotsInputSchema = s.object(
  "Pagination for listing Detrack depots.",
  {
    page: s.integer("The one-based result page number.", { minimum: 1 }),
    limit: s.integer("The number of depots per page.", { minimum: 1, maximum: 100 }),
  },
  { optional: ["page", "limit"] },
);

const jobSchema = s.looseRequiredObject(
  "A Detrack V2 job. Stable identity fields are declared and additional documented fields are preserved.",
  {
    id: s.nonEmptyString("The unique Detrack identifier of the job."),
    type: jobTypeSchema,
    do_number: s.string("The D.O. number of the job."),
    date: s.date("The date when the job is performed."),
    address: s.string("The address where the job is performed."),
    primary_job_status: s.nullable(s.string("The primary operational job status.")),
    status: s.nullable(s.string("The detailed job status.")),
    tracking_status: s.nullable(s.string("The customer-facing tracking status.")),
    tracking_number: s.nullable(s.string("The tracking number associated with the job.")),
    order_number: s.nullable(s.string("The customer order number associated with the job.")),
    assign_to: s.nullable(s.string("The driver or vehicle assignment name.")),
    deliver_to_collect_from: s.nullable(s.string("The delivery recipient or collection contact name.")),
    phone_number: s.nullable(s.string("The contact phone number for the job.")),
    notify_email: s.nullable(s.string("The notification email address for the job.")),
    items: s.array("Items attached to the job.", s.looseObject("A Detrack job item with provider-defined fields.")),
    milestones: s.array(
      "Operational milestones recorded for the job.",
      s.looseObject("A Detrack job milestone with provider-defined fields."),
    ),
    created_at: s.nullable(s.string("The timestamp when Detrack created the job.")),
  },
  {
    optional: [
      "primary_job_status",
      "status",
      "tracking_status",
      "tracking_number",
      "order_number",
      "assign_to",
      "deliver_to_collect_from",
      "phone_number",
      "notify_email",
      "items",
      "milestones",
      "created_at",
    ],
  },
);

const jobOutputSchema = s.requiredObject("One Detrack job.", {
  job: jobSchema,
});

const jobListOutputSchema = s.requiredObject("A page of Detrack jobs.", {
  jobs: s.array("Jobs returned by Detrack.", jobSchema),
  links: paginationLinksSchema,
});

const depotSchema = s.looseRequiredObject(
  "A Detrack depot.",
  {
    id: s.nonEmptyString("The unique Detrack identifier of the depot."),
    name: s.nonEmptyString("The display name of the depot."),
    address: s.string("The depot address."),
    address_lat: s.nullable(s.number("The depot latitude.")),
    address_lng: s.nullable(s.number("The depot longitude.")),
    location: s.nullable({
      type: "array",
      prefixItems: [s.number("The depot longitude."), s.number("The depot latitude.")],
      minItems: 2,
      maxItems: 2,
      description: "The depot coordinates as longitude followed by latitude.",
    }),
  },
  { optional: ["address_lat", "address_lng", "location"] },
);

export const detrackActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_jobs",
    operationType: "read",
    description: "List and filter delivery or collection jobs from Detrack API V2.",
    inputSchema: listJobsInputSchema,
    outputSchema: jobListOutputSchema,
  }),
  defineProviderAction(service, {
    name: "create_job",
    operationType: "write",
    description: "Create a delivery or collection job in Detrack API V2.",
    inputSchema: createJobInputSchema,
    outputSchema: jobOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_job",
    operationType: "read",
    description: "Retrieve one Detrack job by D.O. number and date.",
    inputSchema: jobIdentityInputSchema,
    outputSchema: jobOutputSchema,
  }),
  defineProviderAction(service, {
    name: "update_job",
    operationType: "write",
    description: "Update selected fields on one Detrack job identified by D.O. number and date.",
    inputSchema: updateJobInputSchema,
    outputSchema: jobOutputSchema,
  }),
  defineProviderAction(service, {
    name: "delete_job",
    operationType: "destructive",
    description: "Delete one Detrack job identified by D.O. number and date.",
    inputSchema: jobIdentityInputSchema,
    outputSchema: s.requiredObject("The Detrack deletion acknowledgement.", {
      deleted: s.boolean("Whether Detrack accepted the job deletion."),
    }),
  }),
  defineProviderAction(service, {
    name: "search_jobs",
    operationType: "read",
    description: "Search Detrack jobs with structured operational and customer filters.",
    inputSchema: searchJobsInputSchema,
    outputSchema: jobListOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_depots",
    operationType: "read",
    description: "List depots available in the connected Detrack account.",
    inputSchema: listDepotsInputSchema,
    outputSchema: s.requiredObject("A page of Detrack depots.", {
      depots: s.array("Depots returned by Detrack.", depotSchema),
      links: paginationLinksSchema,
      totalCount: s.integer("The total number of depots matching the request."),
    }),
  }),
];
