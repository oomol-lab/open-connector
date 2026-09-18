import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";
import { googleFormsReadScope, googleFormsResponsesReadScope, googleFormsWriteScope } from "./scopes.ts";

const service = "googleforms";

interface GoogleFormsActionSource {
  name: GoogleFormsActionName;
  operationType: ActionDefinition["operationType"];
  description: string;
  requiredScopes: string[];
  inputSchema: JsonSchema;
  outputSchema: JsonSchema;
}

const jsonObject = s.looseObject("A JSON-like object with arbitrary string keys.");
const jsonObjectArray = s.array("An array of JSON-like objects.", jsonObject);
const publishSettings = s.requiredObject("The simplified publish settings returned by the connector.", {
  isPublished: s.boolean("Whether the form is published."),
  isAcceptingResponses: s.boolean("Whether the form accepts responses."),
});
const googlePublishStateInput = s.requiredObject("The Google Forms publish state to write.", {
  isPublished: s.boolean("Whether the form should be published."),
  isAcceptingResponses: s.boolean("Whether the form should accept responses."),
});
const googlePublishSettingsInput = s.requiredObject("The Google Forms publish settings payload to write.", {
  publishState: googlePublishStateInput,
});
const quizSettings = s.object("Quiz-related settings for the form.", {
  isQuiz: s.boolean("Whether the form is configured as a quiz."),
});
const settings = s.object("Simplified form settings.", {
  quizSettings,
});
const item = s.object("A simplified Google Forms item.", {
  itemId: s.string("The unique ID of the form item."),
  title: s.string("The title or question text of the item."),
  description: s.string("Additional description for the item."),
  questionItem: s.looseObject("Question-specific payload for the item."),
  questionGroupItem: s.looseObject("Question-group-specific payload for the item."),
  pageBreakItem: s.looseObject("Page-break-specific payload for the item."),
  textItem: s.looseObject("Text-item-specific payload for the item."),
  imageItem: s.looseObject("Image-item-specific payload for the item."),
  videoItem: s.looseObject("Video-item-specific payload for the item."),
});
const formSummary = s.object(
  "A simplified Google Form summary.",
  {
    formId: s.string("The ID of the Google Form."),
    title: s.string("The visible title of the form."),
    description: s.string("The description shown below the title."),
    documentTitle: s.string("The Google Drive document title for the form."),
    revisionId: s.string("The revision ID of the form."),
    responderUri: s.string("The URI where respondents can open the form."),
    linkedSheetId: s.string("The linked Google Sheets spreadsheet ID, when present."),
    isPublished: s.boolean("Whether the form is published."),
    isAcceptingResponses: s.boolean("Whether the form is accepting responses."),
  },
  { required: ["formId", "title"] },
);
const formDetail = s.object(
  "A simplified Google Form detail.",
  {
    formId: s.string("The ID of the Google Form."),
    title: s.string("The visible title of the form."),
    description: s.string("The description shown below the title."),
    documentTitle: s.string("The Google Drive document title for the form."),
    revisionId: s.string("The revision ID of the form."),
    responderUri: s.string("The URI where respondents can open the form."),
    linkedSheetId: s.string("The linked Google Sheets spreadsheet ID, when present."),
    settings,
    publishSettings,
    items: s.array("The items currently present in the form.", item),
  },
  { required: ["formId", "title", "items"] },
);
const batchUpdateOutput = s.object(
  "The normalized result of a batch update request.",
  {
    formId: s.string("The ID of the form that was updated."),
    requestCount: s.integer("The number of update requests submitted."),
    replies: jsonObjectArray,
    requiredRevisionId: s.string("The resulting required revision ID after the update."),
    targetRevisionId: s.string("The resulting target revision ID after the update."),
    form: s.looseObject("The updated form payload when includeFormInResponse is true."),
  },
  { required: ["formId", "requestCount", "replies"] },
);
const textAnswer = s.requiredObject("A single text answer.", {
  value: s.string("A text answer value."),
});
const fileUploadAnswer = s.object("A single file-upload answer.", {
  fileId: s.string("The Google Drive file ID for the uploaded file."),
  fileName: s.string("The filename of the uploaded file."),
  mimeType: s.string("The MIME type of the uploaded file."),
});
const grade = s.object("Grade information for an answer.", {
  score: s.number("The awarded score for the answer."),
  correct: s.boolean("Whether the answer was correct."),
  feedback: s.looseObject("Feedback returned for the graded answer."),
});
const answer = s.object("A normalized answer payload.", {
  questionId: s.string("The question ID this answer belongs to."),
  grade,
  textAnswers: s.requiredObject("Text answers for the question.", {
    answers: s.array("The text answers submitted for the question.", textAnswer),
  }),
  fileUploadAnswers: s.requiredObject("File-upload answers for the question.", {
    answers: s.array("The uploaded files submitted for the question.", fileUploadAnswer),
  }),
});
const formResponse = s.object(
  "A normalized Google Forms response.",
  {
    responseId: s.string("The unique ID of the form response."),
    createTime: s.string("The time when the response was created."),
    lastSubmittedTime: s.string("The most recent submission time for the response."),
    respondentEmail: s.string("The respondent email when email collection is enabled."),
    totalScore: s.number("The total score of the response for quiz forms."),
    answers: s.record("A map from question IDs to normalized answer payloads.", answer),
  },
  { required: ["responseId", "answers"] },
);
const watch = s.object(
  "A normalized Google Forms watch.",
  {
    id: s.string("The unique ID of the watch."),
    eventType: s.string("The event type monitored by the watch."),
    state: s.string("The state of the watch."),
    errorType: s.string("The last error type reported for the watch."),
    createTime: s.string("The creation time of the watch."),
    expireTime: s.string("The expiration time of the watch."),
    target: s.requiredObject("The watch delivery target.", {
      topicName: s.string("The Pub/Sub topic name used by the watch."),
    }),
  },
  { required: ["id", "eventType", "target"] },
);

const actions: GoogleFormsActionSource[] = [
  action(
    "create_form",
    "write",
    "Create a Google Form with a simple title-based input and optionally initialize the description and unpublished state.",
    [googleFormsWriteScope],
    input(
      {
        title: s.nonEmptyString("The visible title of the new form."),
        description: s.nonEmptyString("The description shown below the form title."),
        documentTitle: s.nonEmptyString("The Google Drive document title for the new form."),
        unpublished: s.boolean("Whether the form should start unpublished and not accept responses."),
      },
      ["title"],
    ),
    formSummary,
  ),
  action(
    "get_form",
    "read",
    "Retrieve the current structure, settings, publish state, and items of a Google Form.",
    [googleFormsReadScope],
    input(
      {
        formId: s.nonEmptyString("The ID of the form to retrieve."),
      },
      ["formId"],
    ),
    formDetail,
  ),
  action(
    "batch_update_form",
    "write",
    "Apply a batch of Google Forms update requests with optional revision controls and an optional updated form payload.",
    [googleFormsWriteScope],
    input(
      {
        formId: s.nonEmptyString("The ID of the form to update."),
        requests: jsonObjectArray,
        requiredRevisionId: s.nonEmptyString("The revision ID that must match before the update is applied."),
        targetRevisionId: s.nonEmptyString("The target revision ID used for transformed writes."),
        includeFormInResponse: s.boolean("Whether the full updated form should be returned in the response."),
      },
      ["formId", "requests"],
    ),
    batchUpdateOutput,
  ),
  action(
    "set_publish_settings",
    "write",
    "Update whether a Google Form is published and whether it is accepting responses.",
    [googleFormsWriteScope],
    input(
      {
        formId: s.nonEmptyString("The ID of the form to update."),
        publishSettings: googlePublishSettingsInput,
        updateMask: s.stringEnum("The publishSettings fields to update.", ["publishState", "*"]),
      },
      ["formId", "publishSettings"],
    ),
    s.requiredObject("The normalized publish state of the form.", {
      formId: s.string("The ID of the form that was updated."),
      isPublished: s.boolean("Whether the form is now published."),
      isAcceptingResponses: s.boolean("Whether the form is now accepting responses."),
    }),
  ),
  action(
    "list_responses",
    "read",
    "List responses for a Google Form with optional filtering and pagination.",
    [googleFormsResponsesReadScope],
    input(
      {
        formId: s.nonEmptyString("The ID of the form whose responses should be listed."),
        filter: s.nonEmptyString("A Google Forms filter expression used to filter responses."),
        pageSize: s.integer("The maximum number of responses to return.", { minimum: 1, maximum: 5000 }),
        pageToken: s.nonEmptyString("A pagination token returned by a previous list_responses call."),
      },
      ["formId"],
    ),
    s.requiredObject("The normalized result of listing form responses.", {
      responses: s.array("The list of matching form responses.", formResponse),
      nextPageToken: s.nullableString("A pagination token for fetching the next page of responses."),
    }),
  ),
  action(
    "get_response",
    "read",
    "Retrieve a single Google Forms response by its response ID.",
    [googleFormsResponsesReadScope],
    input(
      {
        formId: s.nonEmptyString("The ID of the form that owns the response."),
        responseId: s.nonEmptyString("The ID of the response to retrieve."),
      },
      ["formId", "responseId"],
    ),
    formResponse,
  ),
  action(
    "list_watches",
    "read",
    "List watches configured for a Google Form.",
    [googleFormsReadScope, googleFormsResponsesReadScope],
    input(
      {
        formId: s.nonEmptyString("The ID of the form whose watches should be listed."),
      },
      ["formId"],
    ),
    s.requiredObject("The normalized list of Google Forms watches.", {
      watches: s.array("The watches configured for the form.", watch),
    }),
  ),
];

export const googleFormsActions: ActionDefinition[] = actions.map((source) =>
  defineProviderAction(service, {
    ...source,
    providerPermissions: source.requiredScopes,
  }),
);

export type GoogleFormsActionName =
  | "create_form"
  | "get_form"
  | "batch_update_form"
  | "set_publish_settings"
  | "list_responses"
  | "get_response"
  | "list_watches";

function action(
  name: GoogleFormsActionName,
  operationType: ActionDefinition["operationType"],
  description: string,
  requiredScopes: string[],
  inputSchema: JsonSchema,
  outputSchema: JsonSchema,
): GoogleFormsActionSource {
  return {
    name,
    operationType,
    description,
    requiredScopes,
    inputSchema,
    outputSchema,
  };
}

function input(properties: Record<string, JsonSchema>, required: string[] = []): JsonSchema {
  return s.actionInput(properties, required);
}
