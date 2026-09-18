import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "getform";

const nonEmptyString = (description: string) => s.nonEmptyString(description);
const optionalStringSchema = (description: string) => s.string(description);
const scalarBlockValueSchema = s.anyOf("Scalar field value accepted by a supported Forminit field block.", [
  s.string("String field value."),
  s.number("Numeric field value."),
  s.boolean("Boolean field value."),
]);
const fieldBlockValueSchema = s.anyOf("Field block value sent to Forminit.", [
  scalarBlockValueSchema,
  s.array("Array of selected string values.", s.string("One selected value.")),
]);
const fieldBlockTypeSchema = s.stringEnum("Supported JSON field block type.", [
  "text",
  "number",
  "email",
  "phone",
  "url",
  "date",
  "rating",
  "select",
  "radio",
  "checkbox",
  "country",
]);

const senderBlockPropertiesSchema = s.object(
  "Properties accepted by the Forminit sender block.",
  {
    email: nonEmptyString("Submitter email address."),
    firstName: optionalStringSchema("Submitter first name."),
    lastName: optionalStringSchema("Submitter last name."),
    fullName: optionalStringSchema("Submitter full name."),
    phone: optionalStringSchema("Submitter phone number in E.164 format when provided."),
    title: optionalStringSchema("Submitter title, such as Mr, Mrs, Dr, or Prof."),
    userId: optionalStringSchema("Application-specific submitter identifier."),
    address: optionalStringSchema("Submitter street address."),
    city: optionalStringSchema("Submitter city."),
    country: optionalStringSchema("Submitter country as an ISO 3166-1 alpha-2 code."),
    company: optionalStringSchema("Submitter company or organization."),
    position: optionalStringSchema("Submitter job title or position."),
  },
  {
    optional: [
      "email",
      "firstName",
      "lastName",
      "fullName",
      "phone",
      "title",
      "userId",
      "address",
      "city",
      "country",
      "company",
      "position",
    ],
  },
);

const trackingBlockPropertiesSchema = s.object(
  "Properties accepted by the Forminit tracking block.",
  {
    utmSource: optionalStringSchema("Campaign traffic source, such as google or newsletter."),
    utmMedium: optionalStringSchema("Marketing medium, such as cpc or email."),
    utmCampaign: optionalStringSchema("Campaign name or identifier."),
    utmTerm: optionalStringSchema("Paid keyword or search term."),
    utmContent: optionalStringSchema("Ad or content variant identifier."),
    referrer: optionalStringSchema("Previous page URL or referrer label."),
    gclid: optionalStringSchema("Google Ads click identifier."),
    wbraid: optionalStringSchema("Google Web to App conversion identifier."),
    gbraid: optionalStringSchema("Google App to Web conversion identifier."),
    fbclid: optionalStringSchema("Facebook click identifier."),
    msclkid: optionalStringSchema("Microsoft Ads click identifier."),
    ttclid: optionalStringSchema("TikTok click identifier."),
    twclid: optionalStringSchema("Twitter/X click identifier."),
    li_fat_id: optionalStringSchema("LinkedIn click identifier."),
    amzclid: optionalStringSchema("Amazon Ads click identifier."),
    mc_cid: optionalStringSchema("Mailchimp campaign ID."),
    mc_eid: optionalStringSchema("Mailchimp subscriber ID."),
  },
  {
    optional: [
      "utmSource",
      "utmMedium",
      "utmCampaign",
      "utmTerm",
      "utmContent",
      "referrer",
      "gclid",
      "wbraid",
      "gbraid",
      "fbclid",
      "msclkid",
      "ttclid",
      "twclid",
      "li_fat_id",
      "amzclid",
      "mc_cid",
      "mc_eid",
    ],
  },
);

const senderBlockInputSchema = s.object("Sender block used to describe the submitter.", {
  type: s.literal("sender", { description: "The sender block type." }),
  properties: senderBlockPropertiesSchema,
});

const trackingBlockInputSchema = s.object("Tracking block used to send attribution metadata.", {
  type: s.literal("tracking", { description: "The tracking block type." }),
  properties: trackingBlockPropertiesSchema,
});

const fieldBlockInputSchema = s.object("One JSON field block supported by the first-pass Getform provider.", {
  type: fieldBlockTypeSchema,
  name: nonEmptyString("Unique identifier of the field block."),
  value: fieldBlockValueSchema,
});

const inputBlockSchema = s.anyOf("One JSON block submitted to Forminit.", [
  senderBlockInputSchema,
  trackingBlockInputSchema,
  fieldBlockInputSchema,
]);

const submitFormInputSchema = s.object("Input payload for submitting a protected Forminit form with JSON blocks.", {
  formId: nonEmptyString("The Forminit form ID that will receive the submission."),
  blocks: s.array("The JSON blocks payload submitted to Forminit.", inputBlockSchema, { minItems: 1 }),
});

const listSubmissionsInputSchema = s.object(
  "Input payload for listing submissions from one Forminit form.",
  {
    formId: nonEmptyString("The Forminit form ID whose submissions should be listed."),
    page: s.integer("The page number to request.", { minimum: 1 }),
    size: s.integer("The page size to request. Forminit documents a range of 1 to 100.", {
      minimum: 1,
      maximum: 100,
    }),
    query: nonEmptyString("Search keyword used to filter submissions."),
    files: s.boolean("Whether to include file attachment metadata in the response."),
    timezone: nonEmptyString("IANA timezone name used to format returned dates."),
  },
  { optional: ["page", "size", "query", "files", "timezone"] },
);

const locationCountrySchema = s.looseObject("Country information returned inside submission location metadata.", {
  name: optionalStringSchema("Country name detected for the submission."),
  iso: optionalStringSchema("Country ISO 3166-1 alpha-2 code detected for the submission."),
});

const locationCitySchema = s.looseObject("City information returned inside submission location metadata.", {
  name: optionalStringSchema("City name detected for the submission."),
});

const submissionLocationSchema = s.looseObject("Location metadata returned for a submission when available.", {
  country: locationCountrySchema,
  city: locationCitySchema,
  timezone: optionalStringSchema("IANA timezone detected for the submission."),
});

const submissionInfoSchema = s.looseObject("Submission info metadata returned by Forminit.", {
  ip: optionalStringSchema("Source IP address of the submission."),
  user_agent: optionalStringSchema("User agent captured for the submission."),
  referer: optionalStringSchema("Referrer captured for the submission."),
  location: submissionLocationSchema,
});

const fileMetadataSchema = s.looseObject("One file metadata entry returned when files=true.", {
  url: nonEmptyString("File download URL."),
  name: optionalStringSchema("Uploaded file name."),
  label: optionalStringSchema("Field label or identifier for the file."),
  size: s.nonNegativeInteger("File size in bytes."),
  type: optionalStringSchema("MIME type of the uploaded file."),
});

const senderBlockOutputSchema = s.looseObject("Sender block returned inside a normalized submission blocks object.", {
  email: optionalStringSchema("Submitter email address."),
  firstName: optionalStringSchema("Submitter first name."),
  lastName: optionalStringSchema("Submitter last name."),
  fullName: optionalStringSchema("Submitter full name."),
  phone: optionalStringSchema("Submitter phone number."),
  title: optionalStringSchema("Submitter title."),
  userId: optionalStringSchema("Application-specific submitter identifier."),
  address: optionalStringSchema("Submitter street address."),
  city: optionalStringSchema("Submitter city."),
  country: optionalStringSchema("Submitter country code."),
  company: optionalStringSchema("Submitter company."),
  position: optionalStringSchema("Submitter position."),
});

const trackingBlockOutputSchema = s.looseObject(
  "Tracking block returned inside a normalized submission blocks object.",
  {
    utmSource: optionalStringSchema("Campaign traffic source."),
    utmMedium: optionalStringSchema("Marketing medium."),
    utmCampaign: optionalStringSchema("Campaign identifier."),
    utmTerm: optionalStringSchema("Paid keyword or search term."),
    utmContent: optionalStringSchema("Ad or content variant identifier."),
    referrer: optionalStringSchema("Previous page URL or referrer label."),
    gclid: optionalStringSchema("Google Ads click identifier."),
    wbraid: optionalStringSchema("Google Web to App conversion identifier."),
    gbraid: optionalStringSchema("Google App to Web conversion identifier."),
    fbclid: optionalStringSchema("Facebook click identifier."),
    msclkid: optionalStringSchema("Microsoft Ads click identifier."),
    ttclid: optionalStringSchema("TikTok click identifier."),
    twclid: optionalStringSchema("Twitter/X click identifier."),
    li_fat_id: optionalStringSchema("LinkedIn click identifier."),
    amzclid: optionalStringSchema("Amazon Ads click identifier."),
    mc_cid: optionalStringSchema("Mailchimp campaign ID."),
    mc_eid: optionalStringSchema("Mailchimp subscriber ID."),
  },
);

const dynamicBlocksSchema = s.record(
  s.anyOf("One dynamic Forminit block value.", [
    scalarBlockValueSchema,
    s.array("Array of selected values.", s.string("One selected value.")),
    senderBlockOutputSchema,
    trackingBlockOutputSchema,
  ]),
  {
    description: "Dynamic blocks object returned by Forminit for one submission.",
  },
);

const submissionRecordSchema = s.object(
  "One submission returned by the Forminit list API.",
  {
    id: nonEmptyString("Unique submission identifier returned by Forminit."),
    submissionDate: nonEmptyString("Submission timestamp returned by Forminit."),
    status: s.boolean("Boolean status flag returned for the submission."),
    submissionStatus: optionalStringSchema("Submission lifecycle status, such as open."),
    blocks: dynamicBlocksSchema,
    files: s.array("Attached file metadata when requested.", fileMetadataSchema),
  },
  { optional: ["submissionStatus", "files"] },
);

const listPaginationSchema = s.object("Pagination metadata returned by the Forminit submissions API.", {
  count: s.nonNegativeInteger("Number of submissions in the current response."),
  currentPage: s.integer("Current page number.", { minimum: 1 }),
  total: s.nonNegativeInteger("Total number of submissions."),
  firstPage: s.integer("First page number.", { minimum: 1 }),
  lastPage: s.integer("Last page number.", { minimum: 1 }),
  size: s.integer("Page size used for the current response.", { minimum: 1 }),
});

const submitSubmissionSchema = s.object("Submission payload returned after a successful Forminit form submission.", {
  hashId: nonEmptyString("Unique submission hash identifier."),
  date: nonEmptyString("Submission timestamp in YYYY-MM-DD HH:mm:ss format."),
  blocks: dynamicBlocksSchema,
  submissionInfo: submissionInfoSchema,
});

function action<TName extends GetformActionName>(
  name: TName,
  operationType: ActionDefinition["operationType"],
  description: string,
  inputSchema: JsonSchema,
  outputSchema: JsonSchema,
): ActionDefinition {
  return defineProviderAction(service, {
    name,
    operationType,
    description,
    inputSchema,
    outputSchema,
  });
}

export const getformActions: ActionDefinition[] = [
  action(
    "submit_form",
    "write",
    "Submit a protected Forminit form with JSON blocks using the documented sender, tracking, and field block types.",
    submitFormInputSchema,
    s.object(
      "Normalized result returned by the Forminit submit form API.",
      {
        success: s.boolean("Whether the submission was accepted by Forminit."),
        redirectUrl: optionalStringSchema("Thank-you page URL returned by Forminit."),
        submission: submitSubmissionSchema,
      },
      { optional: ["redirectUrl"] },
    ),
  ),
  action(
    "list_submissions",
    "read",
    "List submissions from one protected Forminit form with pagination, keyword search, optional file metadata, and timezone formatting.",
    listSubmissionsInputSchema,
    s.object("Normalized result returned by the Forminit list submissions API.", {
      data: s.object(
        "The data envelope returned by the Forminit submissions API.",
        {
          id: nonEmptyString("Form ID that owns the returned submissions."),
          apiVersion: optionalStringSchema("API version returned by Forminit."),
          submissions: s.array("Submissions returned for the requested form.", submissionRecordSchema),
          pagination: listPaginationSchema,
        },
        { optional: ["apiVersion"] },
      ),
    }),
  ),
];

export type GetformActionName = "submit_form" | "list_submissions";
