import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "surveymethods";

const statusSchema = s.string("The status message returned by SurveyMethods.");
const surveyCodeSchema = s.string("The SurveyMethods survey code.", { minLength: 1 });
const emailListCodeSchema = s.string("The SurveyMethods email list code.", { minLength: 1 });

const surveySummarySchema = s.object("A SurveyMethods survey summary.", {
  code: surveyCodeSchema,
  title: s.string("The survey title."),
  status: s.string("The survey deployment status."),
  createdDate: s.string("The survey creation date and time in US Central time."),
  latestLaunchDate: s.string("The latest survey launch date and time, or an empty string."),
  closedDate: s.string("The survey close date and time, or an empty string."),
  webLaunchUrl: s.string("The public web launch URL, or an empty string."),
});

const emailListSummarySchema = s.object("A SurveyMethods email list summary.", {
  code: emailListCodeSchema,
  name: s.string("The email list name."),
  type: s.stringEnum("The email list type.", ["Basic", "Advanced"]),
});

const getAccountAction = defineProviderAction(service, {
  name: "get_account",
  description: "Get subscription and license information for the authenticated SurveyMethods account.",
  requiredScopes: [],
  inputSchema: s.object("The input payload for getting the SurveyMethods account.", {}),
  outputSchema: s.object("The authenticated SurveyMethods account response.", {
    status: statusSchema,
    account: s.object("The SurveyMethods account information.", {
      accountType: s.string("The account package type."),
      memberSince: s.string("The account membership start date in MM/DD/YYYY format."),
      expiresOn: s.string("The account expiration date in MM/DD/YYYY format."),
      subscriptionStatus: s.string("The subscription status."),
      license: s.nullable(
        s.object("Enterprise license information when available.", {
          licenseExpiresOn: s.string("The license expiration date in MM/DD/YYYY format."),
          totalLicenses: s.integer("The total number of licenses."),
          usedLicenses: s.integer("The number of used licenses."),
        }),
      ),
    }),
  }),
});

const listSurveysAction = defineProviderAction(service, {
  name: "list_surveys",
  description: "List surveys and their deployment metadata from the SurveyMethods account.",
  requiredScopes: [],
  inputSchema: s.object(
    "The input payload for listing SurveyMethods surveys.",
    {
      recordsPerPage: s.integer("The positive number of surveys to return per page.", {
        minimum: 1,
      }),
      startPage: s.integer("The positive page number to return.", { minimum: 1 }),
    },
    { optional: ["recordsPerPage", "startPage"] },
  ),
  outputSchema: s.object("The paginated SurveyMethods survey response.", {
    status: statusSchema,
    rowCount: s.integer("The total number of matching surveys."),
    pageNumber: s.integer("The returned page number."),
    surveys: s.array("The surveys on the returned page.", surveySummarySchema),
  }),
});

const getSurveyAction = defineProviderAction(service, {
  name: "get_survey",
  description: "Get detailed metadata for one SurveyMethods survey.",
  requiredScopes: [],
  inputSchema: s.object("The input payload for getting a SurveyMethods survey.", {
    surveyCode: surveyCodeSchema,
  }),
  outputSchema: s.object("The SurveyMethods survey detail response.", {
    status: statusSchema,
    survey: s.object("The detailed SurveyMethods survey.", {
      code: surveyCodeSchema,
      title: s.string("The survey title."),
      folderName: s.string("The folder containing the survey."),
      pageCount: s.integer("The number of survey pages."),
      questionCount: s.integer("The number of survey questions."),
      status: s.string("The survey deployment status."),
      ssl: s.object("The survey SSL settings.", {
        surveyLink: s.string("Whether SSL is enabled for the survey link."),
        publishedReports: s.string("Whether SSL is enabled for published reports."),
      }),
      anonymous: s.string("Whether the survey is anonymous."),
      attempts: s.string("The survey attempts setting."),
      width: s.string("The survey width setting."),
      collaborated: s.string("Whether the survey is collaborated."),
      createdDate: s.string("The survey creation date and time in US Central time."),
      latestLaunchDate: s.string("The latest survey launch date and time, or an empty string."),
      closedDate: s.string("The survey close date and time, or an empty string."),
      webLaunchUrl: s.string("The public web launch URL, or an empty string."),
      defaultPublishUrl: s.string("The default published report URL, or an empty string."),
      responseCount: s.integer("The number of survey responses."),
    }),
  }),
});

const listEmailListsAction = defineProviderAction(service, {
  name: "list_email_lists",
  description: "List email lists in the authenticated SurveyMethods account.",
  requiredScopes: [],
  inputSchema: s.object("The input payload for listing SurveyMethods email lists.", {}),
  outputSchema: s.object("The SurveyMethods email list response.", {
    status: statusSchema,
    rowCount: s.integer("The number of email lists returned."),
    emailLists: s.array("The email lists returned by SurveyMethods.", emailListSummarySchema),
  }),
});

const createEmailListAction = defineProviderAction(service, {
  name: "create_email_list",
  description: "Create a Basic or Advanced email list in SurveyMethods.",
  requiredScopes: [],
  inputSchema: s.object(
    "The input payload for creating a SurveyMethods email list.",
    {
      emailListType: s.stringEnum("The email list type.", ["Basic", "Advanced"]),
      emailListName: s.string("The email list name, up to 50 characters.", {
        minLength: 1,
        maxLength: 50,
      }),
      customFieldLabels: s.array(
        "The custom field labels for an Advanced list, in their API order.",
        s.string("A custom field label."),
        { maxItems: 5 },
      ),
    },
    { optional: ["customFieldLabels"] },
  ),
  outputSchema: s.object("The created SurveyMethods email list response.", {
    status: statusSchema,
    emailList: s.object("The created email list.", {
      code: emailListCodeSchema,
      name: s.string("The created email list name."),
    }),
  }),
});

const addEmailListContactAction = defineProviderAction(service, {
  name: "add_email_list_contact",
  description: "Add one contact to a Basic or Advanced SurveyMethods email list.",
  requiredScopes: [],
  inputSchema: s.object(
    "The input payload for adding a SurveyMethods email list contact.",
    {
      emailListCode: emailListCodeSchema,
      email: s.string("The contact email address.", { format: "email" }),
      customFieldValues: s.array(
        "Up to five custom field values for an Advanced email list, in field order.",
        s.string("A custom field value."),
        { maxItems: 5 },
      ),
    },
    { optional: ["customFieldValues"] },
  ),
  outputSchema: s.object("The result of adding the SurveyMethods email list contact.", {
    status: statusSchema,
  }),
});

const listEmailListContactsAction = defineProviderAction(service, {
  name: "list_email_list_contacts",
  description: "List contacts and custom field values from a SurveyMethods email list.",
  requiredScopes: [],
  inputSchema: s.object("The input payload for listing SurveyMethods email list contacts.", {
    emailListCode: emailListCodeSchema,
  }),
  outputSchema: s.object("The SurveyMethods email list contacts response.", {
    status: statusSchema,
    rowCount: s.integer("The number of contacts returned."),
    listType: s.stringEnum("The email list type.", ["Basic", "Advanced"]),
    customFieldLabels: s.nullable(
      s.record(
        "The Advanced email list custom field labels keyed by their API positions.",
        s.string("A custom field label."),
      ),
    ),
    contacts: s.array(
      "The contacts returned by SurveyMethods.",
      s.object("A SurveyMethods email list contact.", {
        email: s.string("The contact email address."),
        customFieldValues: s.nullable(
          s.record("The contact custom field values keyed by their API positions.", s.string("A custom field value.")),
        ),
      }),
    ),
  }),
});

export const surveyMethodsActions: readonly ActionDefinition[] = [
  getAccountAction,
  listSurveysAction,
  getSurveyAction,
  listEmailListsAction,
  createEmailListAction,
  addEmailListContactAction,
  listEmailListContactsAction,
];
