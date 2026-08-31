import type { ProviderActionHandlerSubset } from "../provider-runtime.ts";
import type { MondayProviderActionInput } from "./runtime-common.ts";
import type { MondayActionHandler } from "./runtime-common.ts";

import { compactObject, optionalRecord as asOptionalObject } from "../../core/cast.ts";
import { ProviderRequestError } from "../provider-runtime.ts";
import { asArray, mondayGraphqlRequest } from "./runtime-common.ts";

export const mondayFormsActionHandlers: ProviderActionHandlerSubset<"monday", MondayActionHandler> = {
  get_form(input, fetcher) {
    return mondayGetForm(input, fetcher);
  },
  create_form(input, fetcher) {
    return mondayCreateForm(input, fetcher);
  },
  activate_form(input, fetcher) {
    return mondayActivateForm(input, fetcher);
  },
  deactivate_form(input, fetcher) {
    return mondayDeactivateForm(input, fetcher);
  },
};

async function mondayGetForm(input: MondayProviderActionInput, fetcher: typeof fetch) {
  const source = input.input;
  const payload = await mondayGraphqlRequest<{
    form?: Record<string, unknown>;
  }>(
    input.apiKey,
    {
      query: `
        query GetForm($formToken: String!) {
          form(formToken: $formToken) {
            id
            token
            active
            title
            ownerId
            builtWithAI
            description
            isAnonymous
            type
            features {
              isInternal
              reCaptchaChallenge
              shortenedLink {
                enabled
                url
              }
              password {
                enabled
              }
              draftSubmission {
                enabled
              }
              requireLogin {
                enabled
                redirectToLogin
              }
              responseLimit {
                enabled
                limit
              }
              closeDate {
                enabled
                date
              }
              preSubmissionView {
                enabled
                title
                description
                startButton {
                  text
                }
              }
              afterSubmissionView {
                title
                description
                redirectAfterSubmission {
                  enabled
                  redirectUrl
                }
                allowResubmit
                showSuccessImage
                allowEditSubmission
                allowViewSubmission
              }
              monday {
                itemGroupId
                includeNameQuestion
                includeUpdateQuestion
                syncQuestionAndColumnsTitles
              }
            }
            appearance {
              hideBranding
              showProgressBar
              primaryColor
              layout {
                format
                alignment
                direction
              }
              background {
                type
                value
              }
              text {
                font
                color
                size
              }
              logo {
                position
                url
                size
              }
              submitButton {
                text
              }
            }
            accessibility {
              language
              logoAltText
            }
            tags {
              id
              name
              value
              columnId
            }
            questions {
              id
              type
              visible
              title
              description
              required
              settings {
                prefill {
                  enabled
                  source
                  lookup
                }
                prefixAutofilled
                prefixPredefined {
                  enabled
                  prefix
                }
                checkedByDefault
                defaultCurrentDate
                includeTime
                display
                optionsOrder
                locationAutofilled
                limit
                skipValidation
              }
              options {
                label
              }
              showIfRules
            }
          }
        }
      `,
      variables: {
        formToken: source.formToken,
      },
    },
    fetcher,
    "execute",
  );

  return {
    form: normalizeMondayForm(payload.form),
  };
}

async function mondayCreateForm(input: MondayProviderActionInput, fetcher: typeof fetch) {
  const source = input.input;
  const payload = await mondayGraphqlRequest<{
    create_form?: Record<string, unknown>;
  }>(
    input.apiKey,
    {
      query: `
        mutation CreateForm(
          $destination_workspace_id: ID!
          $destination_folder_id: ID
          $destination_folder_name: String
          $board_kind: BoardKind
          $destination_name: String
          $board_owner_ids: [ID!]
          $board_owner_team_ids: [ID!]
          $board_subscriber_ids: [ID!]
          $board_subscriber_teams_ids: [ID!]
        ) {
          create_form(
            destination_workspace_id: $destination_workspace_id
            destination_folder_id: $destination_folder_id
            destination_folder_name: $destination_folder_name
            board_kind: $board_kind
            destination_name: $destination_name
            board_owner_ids: $board_owner_ids
            board_owner_team_ids: $board_owner_team_ids
            board_subscriber_ids: $board_subscriber_ids
            board_subscriber_teams_ids: $board_subscriber_teams_ids
          ) {
            boardId
            token
          }
        }
      `,
      variables: compactObject({
        destination_workspace_id: source.destination_workspace_id,
        destination_folder_id: source.destination_folder_id,
        destination_folder_name:
          typeof source.destination_folder_name === "string" ? source.destination_folder_name : undefined,
        board_kind: typeof source.board_kind === "string" ? source.board_kind : undefined,
        destination_name: typeof source.destination_name === "string" ? source.destination_name : undefined,
        board_owner_ids: Array.isArray(source.board_owner_ids) ? source.board_owner_ids : undefined,
        board_owner_team_ids: Array.isArray(source.board_owner_team_ids) ? source.board_owner_team_ids : undefined,
        board_subscriber_ids: Array.isArray(source.board_subscriber_ids) ? source.board_subscriber_ids : undefined,
        board_subscriber_teams_ids: Array.isArray(source.board_subscriber_teams_ids)
          ? source.board_subscriber_teams_ids
          : undefined,
      }),
    },
    fetcher,
    "execute",
  );

  return {
    form: normalizeCreatedMondayForm(payload.create_form),
  };
}

async function mondayActivateForm(input: MondayProviderActionInput, fetcher: typeof fetch) {
  const source = input.input;
  const payload = await mondayGraphqlRequest<{
    activate_form?: unknown;
  }>(
    input.apiKey,
    {
      query: `
        mutation ActivateForm($formToken: String!) {
          activate_form(formToken: $formToken)
        }
      `,
      variables: {
        formToken: source.formToken,
      },
    },
    fetcher,
    "execute",
  );

  return {
    formToken: normalizeString(source.formToken, "monday form token"),
    active: normalizeBoolean(payload.activate_form, "monday activate form result"),
  };
}

async function mondayDeactivateForm(input: MondayProviderActionInput, fetcher: typeof fetch) {
  const source = input.input;
  const payload = await mondayGraphqlRequest<{
    deactivate_form?: unknown;
  }>(
    input.apiKey,
    {
      query: `
        mutation DeactivateForm($formToken: String!) {
          deactivate_form(formToken: $formToken)
        }
      `,
      variables: {
        formToken: source.formToken,
      },
    },
    fetcher,
    "execute",
  );

  normalizeBoolean(payload.deactivate_form, "monday deactivate form result");

  return {
    formToken: normalizeString(source.formToken, "monday form token"),
    active: false,
  };
}

function normalizeCreatedMondayForm(value: unknown) {
  const record = asOptionalObject(value);
  if (!record) {
    throw new ProviderRequestError(502, "monday created form payload is missing");
  }

  return {
    boardId: normalizeId(record.boardId, "monday form boardId"),
    token: normalizeString(record.token, "monday form token"),
  };
}

function normalizeMondayForm(value: unknown) {
  const record = asOptionalObject(value);
  if (!record) {
    throw new ProviderRequestError(502, "monday form payload is missing");
  }

  return compactObject({
    id: normalizeId(record.id, "monday form id"),
    token: normalizeString(record.token, "monday form token"),
    active: normalizeBoolean(record.active, "monday form active"),
    title: normalizeString(record.title, "monday form title"),
    ownerId: toOptionalId(record.ownerId),
    builtWithAI: normalizeBoolean(record.builtWithAI, "monday form builtWithAI"),
    description: toOptionalString(record.description),
    isAnonymous: normalizeBoolean(record.isAnonymous, "monday form isAnonymous"),
    type: toOptionalString(record.type),
    features: asOptionalObject(record.features),
    appearance: asOptionalObject(record.appearance),
    accessibility: asOptionalObject(record.accessibility),
    tags: asArray(record.tags).map((tag) => normalizeMondayFormTag(tag)),
    questions: asArray(record.questions).map((question) => normalizeMondayFormQuestion(question)),
  });
}

function normalizeMondayFormTag(value: unknown) {
  const record = asOptionalObject(value);
  if (!record) {
    throw new ProviderRequestError(502, "monday form tag payload is missing");
  }

  return compactObject({
    id: normalizeString(record.id, "monday form tag id"),
    name: normalizeString(record.name, "monday form tag name"),
    value: toOptionalString(record.value),
    columnId: normalizeString(record.columnId, "monday form tag columnId"),
  });
}

function normalizeMondayFormQuestion(value: unknown) {
  const record = asOptionalObject(value);
  if (!record) {
    throw new ProviderRequestError(502, "monday form question payload is missing");
  }

  return compactObject({
    id: normalizeString(record.id, "monday form question id"),
    type: toOptionalString(record.type),
    visible: normalizeBoolean(record.visible, "monday form question visible"),
    title: normalizeString(record.title, "monday form question title"),
    description: toOptionalString(record.description),
    required: normalizeBoolean(record.required, "monday form question required"),
    settings: asOptionalObject(record.settings),
    options: asArray(record.options).map((option) => normalizeMondayFormQuestionOption(option)),
    showIfRules: toNullableObject(record.showIfRules),
  });
}

function normalizeMondayFormQuestionOption(value: unknown) {
  const record = asOptionalObject(value);
  if (!record) {
    throw new ProviderRequestError(502, "monday form question option payload is missing");
  }

  return {
    label: normalizeString(record.label, "monday form question option label"),
  };
}

function toOptionalString(value: unknown) {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function toOptionalId(value: unknown) {
  if (typeof value === "string" && value.length > 0) {
    return value;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  return undefined;
}

function toNullableObject(value: unknown) {
  if (value === null) {
    return null;
  }
  return asOptionalObject(value);
}

function normalizeString(value: unknown, fieldName: string) {
  const normalized = toOptionalString(value);
  if (!normalized) {
    throw new ProviderRequestError(502, `${fieldName} is missing`);
  }
  return normalized;
}

function normalizeId(value: unknown, fieldName: string) {
  const normalized = toOptionalId(value);
  if (!normalized) {
    throw new ProviderRequestError(502, `${fieldName} is missing`);
  }
  return normalized;
}

function normalizeBoolean(value: unknown, fieldName: string) {
  if (typeof value !== "boolean") {
    throw new ProviderRequestError(502, `${fieldName} is missing`);
  }
  return value;
}
