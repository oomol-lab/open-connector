import type { CredentialValidationResult } from "../../core/types.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";
import type { FirefliesActionName } from "./actions.ts";

import { compactObject, optionalRecord, optionalString } from "../../core/cast.ts";
import { providerUserAgent, ProviderRequestError } from "../provider-runtime.ts";

const firefliesGraphqlBaseUrl = "https://api.fireflies.ai";
const firefliesGraphqlUrl = `${firefliesGraphqlBaseUrl}/graphql`;

const userGroupSelection = `
  id
  name
  handle
  members {
    user_id
    first_name
    last_name
    email
  }
`;

const userSelection = `
  user_id
  email
  name
  is_admin
  recent_meeting
  recent_transcript
  num_transcripts
  minutes_consumed
  integrations
  user_groups {
    ${userGroupSelection}
  }
`;

const userRoleSelection = `
  user_id
  email
  name
  is_admin
  recent_meeting
  recent_transcript
  num_transcripts
  minutes_consumed
  integrations
`;

const channelSelection = `
  id
  title
  is_private
  members {
    user_id
    email
    name
  }
`;

const transcriptSelection = `
  id
  title
  date
  user {
    user_id
    email
    name
    is_admin
  }
  summary {
    overview
    notes
    gist
    bullet_gist
    short_summary
    short_overview
    shorthand_bullet
    meeting_type
    action_items
    keywords
    topics_discussed
  }
  sentences {
    speaker_name
    text
    start_time
    end_time
  }
  meeting_attendees {
    display_name
    email
    phone_number
  }
  channels {
    ${channelSelection}
  }
`;

const biteSelection = `
  id
  transcript_id
  name
  user {
    id
    name
    picture
    first_name
    last_name
  }
  status
  preview
  sources {
    src
    type
  }
  summary
  user_id
  captions {
    index
    speaker_id
    speaker_name
    text
    start_time
    end_time
  }
  end_time
  privacies
  thumbnail
  created_at
  media_type
  start_time
  created_from {
    id
    name
    type
    duration
    description
  }
  summary_status
`;

const aiAppOutputSelection = `
  transcript_id
  user_id
  app_id
  created_at
  title
  prompt
  response
`;

const askFredMessageSelection = `
  id
  error
  query
  answer
  status
  thread_id
  created_at
  updated_at
  suggested_queries
`;

const askFredThreadSelection = `
  id
  title
  transcript_id
  user_id
  created_at
`;

const deletedTranscriptSelection = `
  id
  date
  title
  duration
  audio_url
  video_url
  host_email
  participants
  transcript_url
  fireflies_users
  organizer_email
`;

interface FirefliesActionContext extends ApiKeyProviderContext {}

interface FirefliesGraphQLError {
  message?: string;
  code?: string;
  friendly?: boolean;
  path?: Array<string | number>;
  locations?: Array<Record<string, unknown>>;
  extensions?: Record<string, unknown>;
}

interface FirefliesGraphQLResponse<T> {
  data?: T | null;
  errors?: FirefliesGraphQLError[];
  extensions?: Record<string, unknown>;
}

type FirefliesActionHandler = (input: Record<string, unknown>, context: FirefliesActionContext) => Promise<unknown>;

export const firefliesActionHandlers: Record<FirefliesActionName, FirefliesActionHandler> = {
  get_current_user(_input, context) {
    return getCurrentUser(context);
  },
  get_user(input, context) {
    return getUser(input, context);
  },
  list_users(_input, context) {
    return listUsers(context);
  },
  list_channels(_input, context) {
    return listChannels(context);
  },
  list_user_groups(input, context) {
    return listUserGroups(input, context);
  },
  list_transcripts(input, context) {
    return listTranscripts(input, context);
  },
  get_transcript(input, context) {
    return getTranscript(input, context);
  },
  list_bites(input, context) {
    return listBites(input, context);
  },
  get_bite(input, context) {
    return getBite(input, context);
  },
  create_bite(input, context) {
    return createBite(input, context);
  },
  list_ai_app_outputs(input, context) {
    return listAiAppOutputs(input, context);
  },
  list_askfred_threads(input, context) {
    return listAskFredThreads(input, context);
  },
  get_askfred_thread(input, context) {
    return getAskFredThread(input, context);
  },
  create_askfred_thread(input, context) {
    return createAskFredThread(input, context);
  },
  continue_askfred_thread(input, context) {
    return continueAskFredThread(input, context);
  },
  delete_askfred_thread(input, context) {
    return deleteAskFredThread(input, context);
  },
  set_user_role(input, context) {
    return setUserRole(input, context);
  },
  update_meeting_channel(input, context) {
    return updateMeetingChannel(input, context);
  },
  update_meeting_privacy(input, context) {
    return updateMeetingPrivacy(input, context);
  },
  update_meeting_title(input, context) {
    return updateMeetingTitle(input, context);
  },
  delete_transcript(input, context) {
    return deleteTranscript(input, context);
  },
  execute_graphql_query(input, context) {
    return executeGraphqlQuery(input, context);
  },
};

export async function validateFirefliesCredential(
  apiKey: string,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const user = await fetchFirefliesUser(undefined, { apiKey, fetcher, signal });
  const accountId = requireStringField(user, "user_id");
  const displayName = optionalString(user.name) ?? optionalString(user.email) ?? accountId;

  return {
    profile: {
      accountId,
      displayName,
    },
    grantedScopes: [],
    metadata: {
      apiBaseUrl: firefliesGraphqlBaseUrl,
      validationEndpoint: "/graphql",
      user,
    },
  };
}

async function getCurrentUser(context: FirefliesActionContext): Promise<unknown> {
  return {
    user: await fetchFirefliesUser(undefined, context),
  };
}

async function getUser(input: Record<string, unknown>, context: FirefliesActionContext): Promise<unknown> {
  return {
    user: await fetchFirefliesUser(requireStringInput(input, "user_id"), context),
  };
}

async function listUsers(context: FirefliesActionContext): Promise<unknown> {
  const data = await firefliesGraphqlOperation<{ users?: unknown[] }>(
    context,
    `
      query ListUsers {
        users {
          ${userSelection}
        }
      }
    `,
  );

  return {
    users: Array.isArray(data.users) ? data.users : [],
  };
}

async function listChannels(context: FirefliesActionContext): Promise<unknown> {
  const data = await firefliesGraphqlOperation<{ channels?: unknown[] }>(
    context,
    `
      query ListChannels {
        channels {
          ${channelSelection}
        }
      }
    `,
  );

  return {
    channels: Array.isArray(data.channels) ? data.channels : [],
  };
}

async function listUserGroups(input: Record<string, unknown>, context: FirefliesActionContext): Promise<unknown> {
  const data = await firefliesGraphqlOperation<{ user_groups?: unknown[] }>(
    context,
    `
      query ListUserGroups($mine: Boolean) {
        user_groups(mine: $mine) {
          ${userGroupSelection}
        }
      }
    `,
    compactObject({
      mine: input.mine,
    }),
  );

  return {
    user_groups: Array.isArray(data.user_groups) ? data.user_groups : [],
  };
}

async function listTranscripts(input: Record<string, unknown>, context: FirefliesActionContext): Promise<unknown> {
  rejectInputAliasKeys(input, [
    ["organizer_email", "organizers"],
    ["participant_email", "participants"],
  ]);

  const data = await firefliesGraphqlOperation<{ transcripts?: unknown[] }>(
    context,
    `
      query ListTranscripts(
        $skip: Int
        $limit: Int
        $title: String
        $user_id: String
        $from_date: DateTime
        $to_date: DateTime
        $host_email: String
        $organizers: [String!]
        $participants: [String!]
        $channel_id: String
        $include_summary: Boolean
        $include_analytics: Boolean
        $include_audio_url: Boolean
        $include_video_url: Boolean
        $include_sentences: Boolean
        $include_apps_preview: Boolean
        $include_user_details: Boolean
        $include_meeting_attendees: Boolean
        $include_meeting_attendance: Boolean
      ) {
        transcripts(
          skip: $skip
          limit: $limit
          title: $title
          user_id: $user_id
          from_date: $from_date
          to_date: $to_date
          host_email: $host_email
          organizers: $organizers
          participants: $participants
          channel_id: $channel_id
          include_summary: $include_summary
          include_analytics: $include_analytics
          include_audio_url: $include_audio_url
          include_video_url: $include_video_url
          include_sentences: $include_sentences
          include_apps_preview: $include_apps_preview
          include_user_details: $include_user_details
          include_meeting_attendees: $include_meeting_attendees
          include_meeting_attendance: $include_meeting_attendance
        ) {
          ${transcriptSelection}
        }
      }
    `,
    compactObject({
      skip: input.skip,
      limit: input.limit,
      title: input.title,
      user_id: input.user_id,
      from_date: input.from_date,
      to_date: input.to_date,
      host_email: input.host_email,
      organizers: input.organizers,
      participants: input.participants,
      channel_id: input.channel_id,
      include_summary: input.include_summary,
      include_analytics: input.include_analytics,
      include_audio_url: input.include_audio_url,
      include_video_url: input.include_video_url,
      include_sentences: input.include_sentences,
      include_apps_preview: input.include_apps_preview,
      include_user_details: input.include_user_details,
      include_meeting_attendees: input.include_meeting_attendees,
      include_meeting_attendance: input.include_meeting_attendance,
    }),
  );

  return {
    transcripts: Array.isArray(data.transcripts) ? data.transcripts : [],
  };
}

async function getTranscript(input: Record<string, unknown>, context: FirefliesActionContext): Promise<unknown> {
  const data = await firefliesGraphqlOperation<{ transcript?: unknown | null }>(
    context,
    `
      query GetTranscript($transcriptId: String!) {
        transcript(id: $transcriptId) {
          ${transcriptSelection}
        }
      }
    `,
    {
      transcriptId: requireStringInput(input, "id"),
    },
  );

  return {
    transcript: requireObjectResponse(data, "transcript", "fireflies transcript query returned empty payload"),
  };
}

async function listBites(input: Record<string, unknown>, context: FirefliesActionContext): Promise<unknown> {
  requireAtLeastOneInputKey(
    input,
    ["mine", "my_team", "transcript_id"],
    "Provide at least one of mine, my_team, or transcript_id",
  );

  const data = await firefliesGraphqlOperation<{ bites?: unknown[] }>(
    context,
    `
      query ListBites(
        $mine: Boolean
        $my_team: Boolean
        $transcript_id: ID
        $skip: Int
        $limit: Int
      ) {
        bites(
          mine: $mine
          my_team: $my_team
          transcript_id: $transcript_id
          skip: $skip
          limit: $limit
        ) {
          ${biteSelection}
        }
      }
    `,
    compactObject({
      mine: input.mine,
      my_team: input.my_team,
      transcript_id: input.transcript_id,
      skip: input.skip,
      limit: input.limit,
    }),
  );

  return {
    bites: Array.isArray(data.bites) ? data.bites : [],
  };
}

async function getBite(input: Record<string, unknown>, context: FirefliesActionContext): Promise<unknown> {
  const data = await firefliesGraphqlOperation<{ bite?: unknown | null }>(
    context,
    `
      query GetBite($id: ID!) {
        bite(id: $id) {
          ${biteSelection}
        }
      }
    `,
    {
      id: requireStringInput(input, "id"),
    },
  );

  return {
    bite: requireObjectResponse(data, "bite", "fireflies bite query returned empty payload"),
  };
}

async function createBite(input: Record<string, unknown>, context: FirefliesActionContext): Promise<unknown> {
  if (
    typeof input.start_time === "number" &&
    typeof input.end_time === "number" &&
    input.end_time <= input.start_time
  ) {
    throw new ProviderRequestError(400, "end_time must be greater than start_time");
  }

  const data = await firefliesGraphqlOperation<{ createBite?: unknown | null }>(
    context,
    `
      mutation CreateBite(
        $transcript_id: ID!
        $start_time: Float!
        $end_time: Float!
        $name: String
        $summary: String
        $media_type: String
        $privacies: [String!]
      ) {
        createBite(
          transcript_id: $transcript_id
          start_time: $start_time
          end_time: $end_time
          name: $name
          summary: $summary
          media_type: $media_type
          privacies: $privacies
        ) {
          id
          name
          status
        }
      }
    `,
    compactObject({
      transcript_id: input.transcript_id,
      start_time: input.start_time,
      end_time: input.end_time,
      name: input.name,
      summary: input.summary,
      media_type: input.media_type,
      privacies: input.privacies,
    }),
  );

  return {
    bite: requireObjectResponse(data, "createBite", "fireflies create bite returned empty payload"),
  };
}

async function listAiAppOutputs(input: Record<string, unknown>, context: FirefliesActionContext): Promise<unknown> {
  const data = await firefliesGraphqlOperation<{ apps?: unknown }>(
    context,
    `
      query ListAiAppOutputs(
        $app_id: String
        $transcript_id: String
        $skip: Int
        $limit: Int
      ) {
        apps(
          app_id: $app_id
          transcript_id: $transcript_id
          skip: $skip
          limit: $limit
        ) {
          outputs {
            ${aiAppOutputSelection}
          }
        }
      }
    `,
    compactObject({
      app_id: input.app_id,
      transcript_id: input.transcript_id,
      skip: input.skip,
      limit: input.limit,
    }),
  );

  return {
    outputs: normalizeAiAppOutputs(data.apps),
  };
}

async function listAskFredThreads(input: Record<string, unknown>, context: FirefliesActionContext): Promise<unknown> {
  const data = await firefliesGraphqlOperation<{ askfred_threads?: unknown[] }>(
    context,
    `
      query ListAskFredThreads($transcript_id: String) {
        askfred_threads(transcript_id: $transcript_id) {
          ${askFredThreadSelection}
        }
      }
    `,
    compactObject({
      transcript_id: input.transcript_id,
    }),
  );

  return {
    askfred_threads: Array.isArray(data.askfred_threads) ? data.askfred_threads : [],
  };
}

async function getAskFredThread(input: Record<string, unknown>, context: FirefliesActionContext): Promise<unknown> {
  const data = await firefliesGraphqlOperation<{ askfred_thread?: unknown | null }>(
    context,
    `
      query GetAskFredThread($id: String!) {
        askfred_thread(id: $id) {
          ${askFredThreadSelection}
          messages {
            ${askFredMessageSelection}
          }
        }
      }
    `,
    {
      id: requireStringInput(input, "id"),
    },
  );

  return {
    askfred_thread: requireObjectResponse(
      data,
      "askfred_thread",
      "fireflies askfred thread query returned empty payload",
    ),
  };
}

async function createAskFredThread(input: Record<string, unknown>, context: FirefliesActionContext): Promise<unknown> {
  const data = await firefliesGraphqlOperation<{ createAskFredThread?: unknown | null }>(
    context,
    `
      mutation CreateAskFredThread($input: CreateAskFredThreadInput!) {
        createAskFredThread(input: $input) {
          message {
            ${askFredMessageSelection}
          }
        }
      }
    `,
    {
      input: compactObject({
        query: input.query,
        transcript_id: input.transcript_id,
        filters: input.filters,
        response_language: input.response_language,
        format_mode: input.format_mode,
      }),
    },
  );

  return {
    message: requireNestedObjectResponse(
      data,
      "createAskFredThread",
      "message",
      "fireflies create AskFred thread returned empty payload",
    ),
  };
}

async function continueAskFredThread(
  input: Record<string, unknown>,
  context: FirefliesActionContext,
): Promise<unknown> {
  const data = await firefliesGraphqlOperation<{ continueAskFredThread?: unknown | null }>(
    context,
    `
      mutation ContinueAskFredThread($input: ContinueAskFredThreadInput!) {
        continueAskFredThread(input: $input) {
          message {
            ${askFredMessageSelection}
          }
        }
      }
    `,
    {
      input: compactObject({
        thread_id: input.thread_id,
        query: input.query,
        response_language: input.response_language,
        format_mode: input.format_mode,
      }),
    },
  );

  return {
    message: requireNestedObjectResponse(
      data,
      "continueAskFredThread",
      "message",
      "fireflies continue AskFred thread returned empty payload",
    ),
  };
}

async function deleteAskFredThread(input: Record<string, unknown>, context: FirefliesActionContext): Promise<unknown> {
  const data = await firefliesGraphqlOperation<{ deleteAskFredThread?: unknown | null }>(
    context,
    `
      mutation DeleteAskFredThread($id: String!) {
        deleteAskFredThread(id: $id) {
          ${askFredThreadSelection}
        }
      }
    `,
    {
      id: requireStringInput(input, "id"),
    },
  );

  return {
    askfred_thread: requireObjectResponse(
      data,
      "deleteAskFredThread",
      "fireflies delete AskFred thread returned empty payload",
    ),
  };
}

async function setUserRole(input: Record<string, unknown>, context: FirefliesActionContext): Promise<unknown> {
  const data = await firefliesGraphqlOperation<{ setUserRole?: unknown | null }>(
    context,
    `
      mutation SetUserRole($user_id: String!, $role: Role!) {
        setUserRole(user_id: $user_id, role: $role) {
          ${userRoleSelection}
        }
      }
    `,
    {
      user_id: requireStringInput(input, "user_id"),
      role: requireStringInput(input, "role"),
    },
  );

  return {
    user: requireObjectResponse(data, "setUserRole", "fireflies set user role returned empty payload"),
  };
}

async function updateMeetingChannel(input: Record<string, unknown>, context: FirefliesActionContext): Promise<unknown> {
  const data = await firefliesGraphqlOperation<{ updateMeetingChannel?: unknown }>(
    context,
    `
      mutation UpdateMeetingChannel($input: UpdateMeetingChannelInput!) {
        updateMeetingChannel(input: $input) {
          id
          title
          channels {
            id
          }
        }
      }
    `,
    {
      input: compactObject({
        transcript_ids: input.transcript_ids,
        channel_id: input.channel_id,
      }),
    },
  );

  return {
    updated_meetings: normalizeUpdatedMeetings(data.updateMeetingChannel),
  };
}

async function updateMeetingPrivacy(input: Record<string, unknown>, context: FirefliesActionContext): Promise<unknown> {
  const data = await firefliesGraphqlOperation<{ updateMeetingPrivacy?: unknown | null }>(
    context,
    `
      mutation UpdateMeetingPrivacy($input: UpdateMeetingPrivacyInput!) {
        updateMeetingPrivacy(input: $input) {
          id
          title
          privacy
        }
      }
    `,
    {
      input: compactObject({
        id: input.id,
        privacy: input.privacy,
      }),
    },
  );

  return {
    meeting: requireObjectResponse(
      data,
      "updateMeetingPrivacy",
      "fireflies update meeting privacy returned empty payload",
    ),
  };
}

async function updateMeetingTitle(input: Record<string, unknown>, context: FirefliesActionContext): Promise<unknown> {
  const data = await firefliesGraphqlOperation<{ updateMeetingTitle?: unknown | null }>(
    context,
    `
      mutation UpdateMeetingTitle($input: UpdateMeetingTitleInput!) {
        updateMeetingTitle(input: $input) {
          id
          title
        }
      }
    `,
    {
      input: compactObject({
        id: input.id,
        title: input.title,
      }),
    },
  );

  return {
    meeting: requireObjectResponse(data, "updateMeetingTitle", "fireflies update meeting title returned empty payload"),
  };
}

async function deleteTranscript(input: Record<string, unknown>, context: FirefliesActionContext): Promise<unknown> {
  const data = await firefliesGraphqlOperation<{ deleteTranscript?: unknown | null }>(
    context,
    `
      mutation DeleteTranscript($id: String!) {
        deleteTranscript(id: $id) {
          ${deletedTranscriptSelection}
        }
      }
    `,
    {
      id: requireStringInput(input, "id"),
    },
  );

  return {
    deleted_transcript: requireObjectResponse(
      data,
      "deleteTranscript",
      "fireflies delete transcript returned empty payload",
    ),
  };
}

async function executeGraphqlQuery(input: Record<string, unknown>, context: FirefliesActionContext): Promise<unknown> {
  const query = requireStringInput(input, "query");
  if (!isReadOnlyGraphqlQuery(query)) {
    throw new ProviderRequestError(400, "execute_graphql_query only allows read-only query operations");
  }

  const response = await firefliesGraphqlRequest<Record<string, unknown>>(
    context,
    query,
    optionalRecord(input.variables),
    optionalString(input.operationName),
  );

  return compactObject({
    data: response.data ?? null,
    errors: response.errors,
    extensions: response.extensions,
  });
}

async function fetchFirefliesUser(
  userId: string | undefined,
  context: FirefliesActionContext,
): Promise<Record<string, unknown>> {
  const data = await firefliesGraphqlOperation<{ user?: unknown | null }>(
    context,
    `
      query ${userId ? "GetUser" : "GetCurrentUser"}($userId: String) {
        user(id: $userId) {
          ${userSelection}
        }
      }
    `,
    compactObject({
      userId,
    }),
  );

  return requireObjectResponse(data, "user", "fireflies user query returned empty payload");
}

async function firefliesGraphqlRequest<T>(
  context: FirefliesActionContext,
  query: string,
  variables?: Record<string, unknown>,
  operationName?: string,
): Promise<FirefliesGraphQLResponse<T>> {
  let response: Response;
  let body: FirefliesGraphQLResponse<T>;
  try {
    response = await context.fetcher(firefliesGraphqlUrl, {
      method: "POST",
      headers: {
        authorization: `Bearer ${context.apiKey}`,
        "content-type": "application/json",
        "user-agent": providerUserAgent,
      },
      body: JSON.stringify(
        compactObject({
          query,
          variables,
          operationName,
        }),
      ),
      signal: context.signal,
    });

    body = (await readJson(response)) as FirefliesGraphQLResponse<T>;
  } catch (error) {
    throw createFirefliesRequestError(error, query, operationName);
  }

  if (!response.ok) {
    throw createFirefliesHttpError(response.status, body);
  }

  return body;
}

async function firefliesGraphqlOperation<T>(
  context: FirefliesActionContext,
  query: string,
  variables?: Record<string, unknown>,
): Promise<T> {
  const response = await firefliesGraphqlRequest<T>(context, query, variables);

  if (response.errors && response.errors.length > 0) {
    throw createFirefliesGraphqlError(response.errors);
  }
  if (response.data == null) {
    throw new ProviderRequestError(502, "fireflies graphql response did not include data");
  }

  return response.data;
}

async function readJson(response: Response): Promise<Record<string, unknown>> {
  const text = await response.text();
  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return {
      message: text,
    };
  }
}

function normalizeAiAppOutputs(apps: unknown): unknown[] {
  if (Array.isArray(apps)) {
    return apps;
  }

  const appRecord = optionalRecord(apps);
  if (!appRecord) {
    return [];
  }

  const outputs = appRecord.outputs;
  return Array.isArray(outputs) ? outputs : [];
}

function normalizeUpdatedMeetings(updateMeetingChannelResult: unknown): unknown[] {
  if (Array.isArray(updateMeetingChannelResult)) {
    return updateMeetingChannelResult;
  }

  const result = optionalRecord(updateMeetingChannelResult);
  if (!result) {
    return [];
  }

  if (Array.isArray(result.updated_meetings)) {
    return result.updated_meetings;
  }

  return [result];
}

function requireObjectResponse(input: Record<string, unknown>, key: string, message: string): Record<string, unknown> {
  const value = optionalRecord(input[key]);
  if (!value) {
    throw new ProviderRequestError(502, message);
  }
  return value;
}

function requireNestedObjectResponse(
  input: Record<string, unknown>,
  outerKey: string,
  innerKey: string,
  message: string,
): Record<string, unknown> {
  const outerValue = requireObjectResponse(input, outerKey, message);
  const innerValue = optionalRecord(outerValue[innerKey]);
  if (!innerValue) {
    throw new ProviderRequestError(502, message);
  }
  return innerValue;
}

function isReadOnlyGraphqlQuery(query: string): boolean {
  const normalized = trimLeadingFragmentDefinitions(stripGraphqlIgnoredSections(query).toLowerCase());
  if (containsGraphqlKeyword(normalized, "mutation") || containsGraphqlKeyword(normalized, "subscription")) {
    return false;
  }
  return normalized.startsWith("query") || normalized.startsWith("{");
}

function stripGraphqlIgnoredSections(query: string): string {
  let result = "";
  let index = 0;
  let inComment = false;
  let stringDelimiter: '"' | "'" | null = null;

  while (index < query.length) {
    const char = query[index];
    const nextChar = query[index + 1];

    if (inComment) {
      if (char === "\n") {
        inComment = false;
        result += char;
      }
      index += 1;
      continue;
    }

    if (stringDelimiter) {
      if (char === "\\") {
        index += 2;
        continue;
      }
      if (char === stringDelimiter) {
        stringDelimiter = null;
      }
      index += 1;
      continue;
    }

    if (char === "#") {
      inComment = true;
      index += 1;
      continue;
    }

    if (char === '"' || char === "'") {
      if (char === '"' && nextChar === '"' && query[index + 2] === '"') {
        const blockStringEnd = query.indexOf('"""', index + 3);
        if (blockStringEnd === -1) {
          return result;
        }
        index = blockStringEnd + 3;
        continue;
      }
      stringDelimiter = char;
      index += 1;
      continue;
    }

    result += char;
    index += 1;
  }

  return result;
}

function trimLeadingFragmentDefinitions(query: string): string {
  let index = skipWhitespace(query, 0);

  while (query.startsWith("fragment", index) && isGraphqlBoundary(query[index + "fragment".length])) {
    const selectionSetStart = query.indexOf("{", index + "fragment".length);
    if (selectionSetStart === -1) {
      return "";
    }

    index = findSelectionSetEnd(query, selectionSetStart);
    if (index === -1) {
      return "";
    }
    index = skipWhitespace(query, index);
  }

  return query.slice(index);
}

function skipWhitespace(query: string, start: number): number {
  let index = start;
  while (index < query.length && /\s/.test(query[index]!)) {
    index += 1;
  }
  return index;
}

function findSelectionSetEnd(query: string, selectionSetStart: number): number {
  let depth = 0;
  for (let index = selectionSetStart; index < query.length; index += 1) {
    const char = query[index];
    if (char === "{") {
      depth += 1;
      continue;
    }
    if (char !== "}") {
      continue;
    }
    depth -= 1;
    if (depth === 0) {
      return index + 1;
    }
  }
  return -1;
}

function containsGraphqlKeyword(query: string, keyword: string): boolean {
  let index = query.indexOf(keyword);
  while (index !== -1) {
    const previousChar = query[index - 1];
    const nextChar = query[index + keyword.length];
    if (isGraphqlBoundary(previousChar) && isGraphqlBoundary(nextChar)) {
      return true;
    }
    index = query.indexOf(keyword, index + keyword.length);
  }
  return false;
}

function isGraphqlBoundary(char: string | undefined): boolean {
  if (char === undefined) {
    return true;
  }

  return !(
    (char >= "a" && char <= "z") ||
    (char >= "A" && char <= "Z") ||
    (char >= "0" && char <= "9") ||
    char === "_"
  );
}

function createFirefliesRequestError(error: unknown, query: string, operationName?: string): ProviderRequestError {
  if (error instanceof ProviderRequestError) {
    return error;
  }

  const detail = error instanceof Error ? error.message : "Unknown error";
  const operationSummary = operationName ? `operation ${operationName}` : summarizeFirefliesQuery(query);
  return new ProviderRequestError(502, `fireflies graphql request failed for ${operationSummary}: ${detail}`, {
    cause: error,
  });
}

function summarizeFirefliesQuery(query: string): string {
  const compactQuery = query.replace(/\s+/g, " ").trim();
  if (!compactQuery) {
    return "anonymous query";
  }

  const firstBraceIndex = compactQuery.indexOf("{");
  if (firstBraceIndex === -1) {
    return compactQuery.slice(0, 80);
  }

  return compactQuery.slice(0, Math.min(firstBraceIndex, 80)).trim() || "anonymous query";
}

function createFirefliesHttpError(status: number, body: FirefliesGraphQLResponse<unknown>): ProviderRequestError {
  const message = extractGraphqlErrorMessage(body.errors) ?? "fireflies graphql request failed";

  if (status === 401 || status === 403) {
    return new ProviderRequestError(400, message, body);
  }
  if (status === 429) {
    return new ProviderRequestError(429, message, body);
  }

  return new ProviderRequestError(status >= 500 ? 502 : status, message, body);
}

function createFirefliesGraphqlError(errors: FirefliesGraphQLError[]): ProviderRequestError {
  const message = extractGraphqlErrorMessage(errors) ?? "fireflies graphql request failed";
  return new ProviderRequestError(502, message, { errors });
}

function extractGraphqlErrorMessage(errors: FirefliesGraphQLError[] | undefined): string | undefined {
  if (!errors || errors.length === 0) {
    return undefined;
  }

  return errors
    .map((error) => error.message)
    .filter((message): message is string => typeof message === "string" && message.length > 0)
    .join("; ");
}

function rejectInputAliasKeys(
  input: Record<string, unknown>,
  aliasPairs: ReadonlyArray<readonly [string, string]>,
): void {
  for (const [aliasKey, canonicalKey] of aliasPairs) {
    if (aliasKey in input) {
      throw new ProviderRequestError(400, `Use ${canonicalKey} instead of ${aliasKey}`);
    }
  }
}

function requireAtLeastOneInputKey(input: Record<string, unknown>, keys: readonly string[], message: string): void {
  if (
    keys.some((key) => {
      const value = input[key];
      return typeof value === "boolean" ? value : value !== undefined && value !== null;
    })
  ) {
    return;
  }

  throw new ProviderRequestError(400, message);
}

function requireStringInput(input: Record<string, unknown>, key: string): string {
  const value = optionalString(input[key]);
  if (!value) {
    throw new ProviderRequestError(400, `${key} is required`);
  }
  return value;
}

function requireStringField(input: Record<string, unknown>, key: string): string {
  const value = optionalString(input[key]);
  if (!value) {
    throw new ProviderRequestError(502, `fireflies response must include ${key}`);
  }
  return value;
}
