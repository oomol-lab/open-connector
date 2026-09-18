import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "hotjar";

const cursorSchema = s.nonEmptyString("The opaque cursor returned as nextCursor by a previous Hotjar list action.");

const limitSchema = s.integer("The maximum number of records to return, up to 100.", {
  minimum: 1,
  maximum: 100,
});

const choiceSchema = s.looseObject("A selectable choice for a Hotjar survey question.", {
  text: s.string("The text shown for this choice."),
  allow_comment: s.boolean("Whether respondents can add a comment for this choice."),
});

const labelSchema = s.looseObject("The endpoint labels for a scored Hotjar question.", {
  low_label: s.string("The label shown for the lowest score."),
  high_label: s.string("The label shown for the highest score."),
});

const questionSchema = s.looseObject("A question in a Hotjar survey.", {
  id: s.string("The unique Hotjar question identifier."),
  is_required: s.boolean("Whether the respondent must answer this question."),
  text: s.string("The survey question text."),
  type: s.string(
    "The Hotjar question type, such as reaction, long-text, single-option, rating-1-5, nps, statement, or thank-you.",
  ),
  image_url: s.nullable(s.url("The image URL associated with the question, when present.")),
  choices: s.nullable(s.array("The selectable choices for an option question.", choiceSchema)),
  labels: s.nullable(labelSchema),
});

const surveySchema = s.looseObject("A Hotjar survey returned by the API.", {
  id: s.string("The unique Hotjar survey identifier."),
  url: s.string("The Hotjar API path for this survey."),
  created_time: s.dateTime("The time the survey was created in RFC 3339 format."),
  updated_time: s.dateTime("The time the survey was last updated in RFC 3339 format."),
  is_enabled: s.boolean("Whether the survey is enabled."),
  name: s.string("The survey name."),
  responses_url: s.string("The Hotjar API path for this survey's responses."),
  type: s.stringEnum("The Hotjar survey presentation type.", ["link", "full_screen", "popover"]),
  questions: s.array("The questions included in this survey response.", questionSchema),
  sentiment_analysis_enabled: s.boolean("Whether Hotjar sentiment analysis is enabled for this survey."),
});

const answerSchema = s.looseObject("An answer in a Hotjar survey response.", {
  question_id: s.string("The identifier of the answered survey question."),
  answer: s.string("The answer value recorded by Hotjar."),
  comment: s.nullable(s.string("The optional respondent comment.")),
  tags: s.array(
    "The tags attached to this answer.",
    s.looseObject("A Hotjar survey response tag.", {
      name: s.string("The tag name."),
    }),
  ),
  sentiment: s.nullable(
    s.stringEnum("The sentiment assigned to the answer text, when available.", ["positive", "negative", "neutral"]),
  ),
});

const userAttributeSchema = s.looseObject("A user attribute included through the Hotjar Identify API.", {
  name: s.string("The user attribute name."),
  value: s.unknown("The string, number, boolean, or datetime attribute value."),
});

const windowSizeSchema = s.looseObject("The browser window size for a survey response.", {
  width: s.integer("The browser window width in pixels."),
  height: s.integer("The browser window height in pixels."),
});

const surveyResponseSchema = s.looseObject("A response submitted to a Hotjar survey.", {
  id: s.string("The unique Hotjar survey response identifier."),
  answers: s.array("The answers included in this survey response.", answerSchema),
  browser: s.string("The browser used to submit the survey response."),
  country: s.string("The two-letter country code associated with the respondent."),
  created_time: s.dateTime("The response submission time in RFC 3339 format."),
  device: s.stringEnum("The device type used to submit the response.", ["tablet", "mobile", "desktop"]),
  hotjar_user_id: s.string("The Hotjar identifier for the respondent."),
  is_complete: s.boolean("Whether the survey response is complete."),
  os: s.string("The respondent's operating system."),
  recording_url: s.nullable(s.url("The related Hotjar recording URL, or null when no recording is available.")),
  response_origin_url: s.url("The site URL where the survey response was submitted."),
  user_attributes: s.array("The respondent attributes supplied through the Hotjar Identify API.", userAttributeSchema),
  window_size: windowSizeSchema,
});

const listSurveysInputSchema = s.object(
  "Pagination and expansion options for listing Hotjar surveys.",
  {
    siteId: s.nonEmptyString("The Hotjar site identifier."),
    limit: limitSchema,
    cursor: cursorSchema,
    withQuestions: s.boolean("Whether each survey should include its question definitions."),
  },
  { optional: ["limit", "cursor", "withQuestions"] },
);

const userLookupInputSchema = s.object(
  "The organization and data subject used for a Hotjar user lookup or deletion request.",
  {
    organizationId: s.nonEmptyString("The Hotjar organization identifier."),
    dataSubjectEmail: s.email("The email address of the data subject."),
    dataSubjectSiteIdToUserIdMap: s.record(
      "A mapping from Hotjar site identifiers to the user's identifier on each site.",
      s.nonEmptyString("The user's identifier on the mapped site."),
    ),
    deleteAllHits: s.boolean(
      "Whether Hotjar should immediately and silently delete all matching user data. Set false to request a lookup report instead.",
    ),
  },
  { optional: ["dataSubjectEmail", "dataSubjectSiteIdToUserIdMap"] },
);

export const hotjarActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_surveys",
    operationType: "read",
    description: "List surveys for a Hotjar site with cursor pagination.",
    inputSchema: listSurveysInputSchema,
    outputSchema: s.requiredObject("A page of Hotjar surveys.", {
      surveys: s.array("The Hotjar surveys returned for this page.", surveySchema),
      nextCursor: s.nullable(s.string("The cursor for the next page, or null when there are no more surveys.")),
    }),
    followUpActions: ["hotjar.get_survey"],
  }),
  defineProviderAction(service, {
    name: "get_survey",
    operationType: "read",
    description: "Get one Hotjar survey with its question definitions.",
    inputSchema: s.requiredObject("The site and survey identifiers to retrieve.", {
      siteId: s.nonEmptyString("The Hotjar site identifier."),
      surveyId: s.nonEmptyString("The Hotjar survey identifier."),
    }),
    outputSchema: s.requiredObject("One Hotjar survey.", {
      survey: surveySchema,
    }),
    followUpActions: ["hotjar.list_survey_responses"],
  }),
  defineProviderAction(service, {
    name: "list_survey_responses",
    operationType: "read",
    description: "List responses submitted to one Hotjar survey with cursor pagination.",
    inputSchema: s.object(
      "The survey identifiers and pagination controls for listing responses.",
      {
        siteId: s.nonEmptyString("The Hotjar site identifier."),
        surveyId: s.nonEmptyString("The Hotjar survey identifier."),
        limit: limitSchema,
        cursor: cursorSchema,
      },
      { optional: ["limit", "cursor"] },
    ),
    outputSchema: s.requiredObject("A page of Hotjar survey responses.", {
      responses: s.array("The Hotjar survey responses returned for this page.", surveyResponseSchema),
      nextCursor: s.nullable(s.string("The cursor for the next page, or null when there are no more responses.")),
    }),
  }),
  defineProviderAction(service, {
    name: "submit_user_lookup",
    operationType: "destructive",
    description:
      "Submit a Hotjar organization user lookup request, optionally deleting all matching data when deleteAllHits is true.",
    inputSchema: userLookupInputSchema,
    outputSchema: s.requiredObject("The accepted Hotjar user lookup request.", {
      accepted: s.boolean("Whether Hotjar accepted the lookup or deletion request."),
    }),
  }),
];
