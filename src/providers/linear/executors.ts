import type {
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";
import type { LinearActionName } from "./actions.ts";

import { compactObject } from "../../core/cast.ts";
import {
  createProviderFetch,
  createProviderProxyUrl,
  defineProviderExecutors,
  normalizeProviderProxyHeaders,
  ProviderRequestError,
  providerUserAgent,
  readProviderProxyErrorMessage,
  readProviderProxyResponse,
  toProviderProxyError,
} from "../provider-runtime.ts";

const linearApiBaseUrl = "https://api.linear.app";
const linearGraphqlUrl = "https://api.linear.app/graphql";
const linearFetch = createProviderFetch({ skipDnsValidation: true });

const pageInfoFields = `
  startCursor
  endCursor
  hasPreviousPage
  hasNextPage
`;

const userFields = `
  id
  name
  displayName
  email
  avatarUrl
  active
  admin
  createdAt
`;

const teamFields = `
  id
  name
  key
`;

const workflowStateFields = `
  id
  name
  type
  color
  description
`;

const labelFields = `
  id
  name
  color
  description
  isGroup
  parent {
    id
    name
  }
`;

const cycleFields = `
  id
  name
  number
  description
  startsAt
  endsAt
  completedAt
  isActive
  isFuture
  isPast
  isNext
  isPrevious
  team {
    ${teamFields}
  }
`;

const projectStatusFields = `
  id
  name
  type
  color
  description
`;

const projectFields = `
  id
  name
  description
  url
  slugId
  icon
  color
  state
  health
  progress
  priority
  priorityLabel
  scope
  startDate
  targetDate
  createdAt
  updatedAt
  lead {
    ${userFields}
  }
  creator {
    ${userFields}
  }
  status {
    ${projectStatusFields}
  }
`;

const initiativeFields = `
  id
  name
  description
  url
`;

const attachmentFields = `
  id
  title
  subtitle
  url
  sourceType
  metadata
  source
  createdAt
  updatedAt
  issue {
    id
    identifier
    title
  }
`;

const reactionFields = `
  id
  emoji
  createdAt
  updatedAt
  user {
    ${userFields}
  }
  comment {
    id
  }
  issue {
    id
    identifier
  }
  projectUpdate {
    id
  }
`;

const commentFields = `
  id
  body
  url
  quotedText
  createdAt
  updatedAt
  editedAt
  resolvedAt
  issueId
  parentId
  projectUpdateId
  user {
    ${userFields}
  }
  reactions {
    ${reactionFields}
  }
`;

const issueFields = `
  id
  identifier
  title
  description
  url
  createdAt
  updatedAt
  archivedAt
  completedAt
  dueDate
  priority
  estimate
  team {
    ${teamFields}
  }
  state {
    ${workflowStateFields}
  }
  project {
    ${projectFields}
  }
  assignee {
    ${userFields}
  }
  creator {
    ${userFields}
  }
  cycle {
    ${cycleFields}
  }
  parent {
    id
    identifier
    title
  }
  labels(first: 50) {
    nodes {
      ${labelFields}
    }
  }
`;

const detailedIssueFields = `
  ${issueFields}
  attachments(first: 50) {
    nodes {
      ${attachmentFields}
    }
    pageInfo {
      ${pageInfoFields}
    }
  }
  comments(first: 50) {
    nodes {
      ${commentFields}
    }
    pageInfo {
      ${pageInfoFields}
    }
  }
  subscribers(first: 50) {
    nodes {
      ${userFields}
    }
    pageInfo {
      ${pageInfoFields}
    }
  }
  reactions {
    ${reactionFields}
  }
`;

interface LinearActionContext {
  authorization: string;
  fetcher: typeof fetch;
}

interface LinearGraphQLError {
  message: string;
  path?: Array<string | number>;
  locations?: Array<{ line: number; column: number }>;
  extensions?: Record<string, unknown>;
}

interface LinearGraphQLResponse<T> {
  data?: T | null;
  errors?: LinearGraphQLError[];
  extensions?: Record<string, unknown>;
}

interface LinearPageInfo {
  startCursor?: string | null;
  endCursor?: string | null;
  hasPreviousPage?: boolean;
  hasNextPage?: boolean;
}

interface LinearConnection<T> {
  nodes?: T[];
  pageInfo?: LinearPageInfo;
}

type LinearActionHandler = (input: Record<string, unknown>, context: LinearActionContext) => Promise<unknown>;

export const linearActionHandlers: Record<LinearActionName, LinearActionHandler> = {
  async create_attachment(input, context) {
    const payload = await linearGraphqlOperation<{
      attachmentCreate?: { success?: boolean; attachment?: { id?: string } };
    }>(
      context,
      `
        mutation CreateAttachment($input: AttachmentCreateInput!) {
          attachmentCreate(input: $input) {
            success
            attachment {
              id
            }
          }
        }
      `,
      {
        input: compactObject({
          issueId: getString(input.issue_id),
          title: getString(input.title),
          url: getString(input.url),
          subtitle: getOptionalString(input.subtitle),
        }),
      },
    );

    const attachmentId = requireMutationEntityId(
      payload.attachmentCreate,
      "attachment",
      "linear create_attachment failed",
    );
    const attachment = await fetchAttachmentById(context, attachmentId);

    return {
      id: attachment.id,
      issue_id: attachment.issue?.id ?? getString(input.issue_id),
      title: attachment.title,
      url: attachment.url,
      subtitle: attachment.subtitle ?? null,
    };
  },

  async create_comment_reaction(input, context) {
    const payload = await linearGraphqlOperation<{
      reactionCreate?: { success?: boolean; reaction?: { id?: string } };
    }>(
      context,
      `
        mutation CreateCommentReaction($input: ReactionCreateInput!) {
          reactionCreate(input: $input) {
            success
            reaction {
              id
            }
          }
        }
      `,
      {
        input: {
          commentId: getString(input.comment_id),
          emoji: getString(input.emoji),
        },
      },
    );

    return {
      reaction_id: requireMutationEntityId(payload.reactionCreate, "reaction", "linear create_comment_reaction failed"),
      comment_id: getString(input.comment_id),
      emoji: getString(input.emoji),
    };
  },

  async create_linear_comment(input, context) {
    const payload = await linearGraphqlOperation<{
      commentCreate?: { success?: boolean; comment?: { id?: string } };
    }>(
      context,
      `
        mutation CreateComment($input: CommentCreateInput!) {
          commentCreate(input: $input) {
            success
            comment {
              id
            }
          }
        }
      `,
      {
        input: {
          issueId: getString(input.issueId),
          body: getString(input.body),
        },
      },
    );

    const commentId = requireMutationEntityId(payload.commentCreate, "comment", "linear create_linear_comment failed");
    const comment = await fetchCommentById(context, commentId);

    return {
      comment_id: comment.id,
      issue_id: comment.issueId ?? getString(input.issueId),
      body: comment.body ?? getString(input.body),
    };
  },

  async create_linear_issue(input, context) {
    const payload = await linearGraphqlOperation<{
      issueCreate?: { success?: boolean; issue?: { id?: string } };
    }>(
      context,
      `
        mutation CreateIssue($input: IssueCreateInput!) {
          issueCreate(input: $input) {
            success
            issue {
              id
            }
          }
        }
      `,
      {
        input: compactObject({
          title: getString(input.title),
          teamId: getString(input.team_id),
          cycleId: getOptionalString(input.cycle_id),
          dueDate: getOptionalString(input.due_date),
          estimate: getOptionalNumber(input.estimate),
          priority: getOptionalNumber(input.priority),
          stateId: getOptionalString(input.state_id),
          labelIds: getOptionalStringArray(input.label_ids),
          parentId: getOptionalString(input.parent_id),
          projectId: getOptionalString(input.project_id),
          assigneeId: getOptionalString(input.assignee_id),
          description: getOptionalString(input.description),
        }),
      },
    );

    const issueId = requireMutationEntityId(payload.issueCreate, "issue", "linear create_linear_issue failed");
    const issue = await fetchIssueById(context, issueId);

    return {
      id: issue.id,
      identifier: issue.identifier,
      issue_title: issue.title,
      issue_description: issue.description ?? null,
      ticket_url: issue.url,
    };
  },

  async create_linear_issue_relation(input, context) {
    const payload = await linearGraphqlOperation<{
      issueRelationCreate?: { success?: boolean; issueRelation?: { id?: string } };
    }>(
      context,
      `
        mutation CreateIssueRelation($input: IssueRelationCreateInput!) {
          issueRelationCreate(input: $input) {
            success
            issueRelation {
              id
            }
          }
        }
      `,
      {
        input: {
          issueId: getString(input.issue_id),
          relatedIssueId: getString(input.related_issue_id),
          type: getString(input.relation_type),
        },
      },
    );

    const relationId = requireMutationEntityId(
      payload.issueRelationCreate,
      "issueRelation",
      "linear create_linear_issue_relation failed",
    );
    const relation = await fetchIssueRelationById(context, relationId);

    return {
      id: relation.id,
      issue_id: relation.issue?.id ?? getString(input.issue_id),
      related_issue_id: relation.relatedIssue?.id ?? getString(input.related_issue_id),
      relation_type: relation.type ?? getString(input.relation_type),
    };
  },

  async create_linear_label(input, context) {
    const payload = await linearGraphqlOperation<{
      issueLabelCreate?: { success?: boolean; issueLabel?: { id?: string } };
    }>(
      context,
      `
        mutation CreateIssueLabel($input: IssueLabelCreateInput!) {
          issueLabelCreate(input: $input) {
            success
            issueLabel {
              id
            }
          }
        }
      `,
      {
        input: compactObject({
          teamId: getString(input.team_id),
          name: getString(input.name),
          color: getString(input.color),
          description: getOptionalString(input.description),
        }),
      },
    );

    const labelId = requireMutationEntityId(
      payload.issueLabelCreate,
      "issueLabel",
      "linear create_linear_label failed",
    );
    const label = await fetchIssueLabelById(context, labelId);

    return {
      id: label.id,
      team_id: label.team?.id ?? getString(input.team_id),
      name: label.name,
      color: label.color ?? getString(input.color),
      description: label.description ?? null,
    };
  },

  async create_linear_project(input, context) {
    const payload = await linearGraphqlOperation<{
      projectCreate?: { success?: boolean; project?: { id?: string } };
    }>(
      context,
      `
        mutation CreateProject($input: ProjectCreateInput!) {
          projectCreate(input: $input) {
            success
            project {
              id
            }
          }
        }
      `,
      {
        input: compactObject({
          icon: getOptionalString(input.icon),
          name: getString(input.name),
          color: getOptionalString(input.color),
          leadId: getOptionalString(input.lead_id),
          priority: getOptionalNumber(input.priority),
          teamIds: getStringArray(input.team_ids),
          startDate: getOptionalString(input.start_date),
          description: getOptionalString(input.description),
          targetDate: getOptionalString(input.target_date),
        }),
      },
    );

    const projectId = requireMutationEntityId(payload.projectCreate, "project", "linear create_linear_project failed");
    const project = await fetchProjectById(context, projectId, false, false, false);

    return {
      id: project.id,
      name: project.name,
      url: project.url,
      state: project.state,
    };
  },

  async create_project_milestone(input, context) {
    const payload = await linearGraphqlOperation<{
      projectMilestoneCreate?: { success?: boolean; projectMilestone?: { id?: string } };
    }>(
      context,
      `
        mutation CreateProjectMilestone($input: ProjectMilestoneCreateInput!) {
          projectMilestoneCreate(input: $input) {
            success
            projectMilestone {
              id
            }
          }
        }
      `,
      {
        input: compactObject({
          name: getString(input.name),
          projectId: getString(input.project_id),
          sortOrder: getOptionalNumber(input.sort_order),
          description: getOptionalString(input.description),
          targetDate: getOptionalString(input.target_date),
        }),
      },
    );

    const milestoneId = requireMutationEntityId(
      payload.projectMilestoneCreate,
      "projectMilestone",
      "linear create_project_milestone failed",
    );
    const milestone = await fetchProjectMilestoneById(context, milestoneId);

    return {
      id: milestone.id,
      project_id: milestone.project?.id ?? getString(input.project_id),
      name: milestone.name,
      target_date: milestone.targetDate ?? null,
    };
  },

  async create_project_update(input, context) {
    const payload = await linearGraphqlOperation<{
      projectUpdateCreate?: { success?: boolean; projectUpdate?: { id?: string } };
    }>(
      context,
      `
        mutation CreateProjectUpdate($input: ProjectUpdateCreateInput!) {
          projectUpdateCreate(input: $input) {
            success
            projectUpdate {
              id
            }
          }
        }
      `,
      {
        input: compactObject({
          body: getString(input.body),
          health: getOptionalString(input.health),
          projectId: getString(input.project_id),
          isDiffHidden: getOptionalBoolean(input.is_diff_hidden),
        }),
      },
    );

    const projectUpdateId = requireMutationEntityId(
      payload.projectUpdateCreate,
      "projectUpdate",
      "linear create_project_update failed",
    );
    const projectUpdate = await fetchProjectUpdateById(context, projectUpdateId);

    return {
      id: projectUpdate.id,
      project_id: projectUpdate.project?.id ?? getString(input.project_id),
      body: projectUpdate.body ?? null,
      health: projectUpdate.health ?? null,
      is_diff_hidden: Boolean(projectUpdate.isDiffHidden),
    };
  },

  async delete_linear_issue(input, context) {
    const payload = await linearGraphqlOperation<{
      issueDelete?: { success?: boolean; entity?: { id?: string } };
    }>(
      context,
      `
        mutation DeleteIssue($id: String!) {
          issueDelete(id: $id) {
            success
            entity {
              id
            }
          }
        }
      `,
      {
        id: getString(input.issue_id),
      },
    );

    return {
      id: requireArchiveEntityId(payload.issueDelete, "linear delete_linear_issue failed"),
      deleted: true,
    };
  },

  async get_all_linear_teams(_input, context) {
    const teams = await fetchAllConnectionNodes<any, any>(context, {
      query: `
        query ListTeams($after: String) {
          teams(after: $after, first: 100, includeArchived: false) {
            nodes {
              ${teamFields}
            }
            pageInfo {
              ${pageInfoFields}
            }
          }
        }
      `,
      extract(data) {
        return data.teams;
      },
    });

    return {
      teams: teams.map(mapTeam),
    };
  },

  async get_attachment(input, context) {
    const attachmentId = getOptionalString(input.attachment_id);
    const fileName = getOptionalString(input.file_name);
    if (!attachmentId && !fileName) {
      throw new ProviderRequestError(400, "linear attachment requires attachment_id or file_name");
    }

    const attachments = await fetchIssueAttachments(context, getString(input.issue_id));
    const matched = attachments.find((attachment: any) => {
      if (attachmentId && attachment.id === attachmentId) {
        return true;
      }

      if (fileName && attachment.title === fileName) {
        return true;
      }

      return fileName ? basenameFromUrl(String(attachment.url ?? "")) === fileName : false;
    });

    if (!matched) {
      throw new ProviderRequestError(
        400,
        "linear attachment not found for the provided issue_id and attachment identifier",
      );
    }

    return {
      attachment: mapAttachment(matched),
    };
  },

  async get_current_user(_input, context) {
    const viewer = await fetchLinearViewer(context.authorization, context.fetcher);
    return {
      viewer: mapUser(viewer),
    };
  },

  async get_cycles_by_team_id(input, context) {
    const cycles = await fetchTeamCycles(context, getString(input.team_id));
    return {
      cycles: cycles.map(mapCycle),
    };
  },

  async get_issue_defaults(input, context) {
    const data = await linearGraphqlOperation<{
      team?: { defaultIssueEstimate?: number | null; defaultIssueState?: any | null };
    }>(
      context,
      `
        query GetIssueDefaults($id: String!) {
          team(id: $id) {
            defaultIssueEstimate
            defaultIssueState {
              id
              name
            }
          }
        }
      `,
      {
        id: getString(input.team_id),
      },
    );

    if (!data.team) {
      throw new ProviderRequestError(400, "linear team not found");
    }

    return {
      team: {
        defaultIssueState: data.team.defaultIssueState
          ? {
              id: String(data.team.defaultIssueState.id),
              name: String(data.team.defaultIssueState.name),
            }
          : null,
        defaultIssueEstimate:
          typeof data.team.defaultIssueEstimate === "number" ? data.team.defaultIssueEstimate : null,
      },
    };
  },

  async get_linear_issue(input, context) {
    const issue = await fetchIssueById(context, getString(input.issue_id));
    return {
      issue: mapDetailedIssue(issue),
    };
  },

  async get_linear_project(input, context) {
    const project = await fetchProjectById(
      context,
      getString(input.project_id),
      Boolean(input.include_teams),
      Boolean(input.include_members),
      Boolean(input.include_initiatives),
    );

    return {
      project: mapProject(project, {
        includeTeams: Boolean(input.include_teams),
        includeMembers: Boolean(input.include_members),
        includeInitiatives: Boolean(input.include_initiatives),
      }),
    };
  },

  async list_issues_by_team_id(input, context) {
    const payload = await linearGraphqlOperation<{
      team?: {
        id: string;
        name: string;
        key?: string;
        issues?: LinearConnection<any>;
      };
    }>(
      context,
      `
        query ListIssuesByTeamId($id: String!, $after: String, $first: Int, $includeArchived: Boolean) {
          team(id: $id) {
            ${teamFields}
            issues(after: $after, first: $first, includeArchived: $includeArchived) {
              nodes {
                ${issueFields}
              }
              pageInfo {
                ${pageInfoFields}
              }
            }
          }
        }
      `,
      {
        id: getString(input.team_id),
        after: getOptionalString(input.after),
        first: getOptionalNumber(input.first),
        includeArchived: getOptionalBoolean(input.include_archived),
      },
    );

    if (!payload.team) {
      throw new ProviderRequestError(400, "linear team not found");
    }

    return {
      team: mapTeam(payload.team),
      issues: (payload.team.issues?.nodes ?? []).map(mapIssueSummary),
      page_info: mapSnakePageInfo(payload.team.issues?.pageInfo),
    };
  },

  async list_issue_drafts(input, context) {
    const payload = await linearGraphqlOperation<{
      viewer?: { drafts?: LinearConnection<any> };
    }>(
      context,
      `
        query ListIssueDrafts($after: String, $first: Int) {
          viewer {
            drafts(after: $after, first: $first, includeArchived: false) {
              nodes {
                id
                data
                bodyData
                createdAt
                updatedAt
                isAutogenerated
                team {
                  ${teamFields}
                }
                issue {
                  id
                }
                project {
                  id
                }
                projectUpdate {
                  id
                }
                user {
                  ${userFields}
                }
              }
              pageInfo {
                ${pageInfoFields}
              }
            }
          }
        }
      `,
      {
        after: getOptionalString(input.after),
        first: getOptionalNumber(input.first),
      },
    );

    return {
      drafts: (payload.viewer?.drafts?.nodes ?? []).map(mapDraft),
      page_info: mapPageInfo(payload.viewer?.drafts?.pageInfo),
    };
  },

  async list_linear_cycles(_input, context) {
    const cycles = await fetchAllConnectionNodes<any, any>(context, {
      query: `
        query ListCycles($after: String) {
          cycles(after: $after, first: 100, includeArchived: false) {
            nodes {
              ${cycleFields}
            }
            pageInfo {
              ${pageInfoFields}
            }
          }
        }
      `,
      extract(data) {
        return data.cycles;
      },
    });

    return {
      cycles: cycles.map(mapCycle),
    };
  },

  async list_linear_issues(input, context) {
    const assigneeId = await resolveAssigneeFilterId(context, getOptionalString(input.assignee_id));
    const payload = await linearGraphqlOperation<{
      issues?: LinearConnection<any>;
    }>(
      context,
      `
        query ListLinearIssues($after: String, $first: Int, $filter: IssueFilter) {
          issues(after: $after, first: $first, includeArchived: false, filter: $filter) {
            nodes {
              ${issueFields}
            }
            pageInfo {
              ${pageInfoFields}
            }
          }
        }
      `,
      {
        after: getOptionalString(input.after),
        first: getOptionalNumber(input.first),
        filter: buildIssuesFilter(getOptionalString(input.project_id), assigneeId),
      },
    );

    return {
      issues: (payload.issues?.nodes ?? []).map(mapIssueSummary),
      page_info: mapPageInfo(payload.issues?.pageInfo),
    };
  },

  async list_linear_labels(input, context) {
    const teamId = getOptionalString(input.team_id);
    const labels = teamId
      ? await fetchTeamLabels(context, teamId)
      : await fetchAllConnectionNodes<any, any>(context, {
          query: `
            query ListWorkspaceLabels($after: String) {
              issueLabels(after: $after, first: 100, includeArchived: false) {
                nodes {
                  ${labelFields}
                  team {
                    ${teamFields}
                  }
                }
                pageInfo {
                  ${pageInfoFields}
                }
              }
            }
          `,
          extract(data) {
            return data.issueLabels;
          },
        });

    return {
      labels: labels.map(mapLabel),
    };
  },

  async list_linear_projects(_input, context) {
    const projects = await fetchAllConnectionNodes<any, any>(context, {
      query: `
        query ListProjects($after: String) {
          projects(after: $after, first: 100, includeArchived: false) {
            nodes {
              ${projectFields}
            }
            pageInfo {
              ${pageInfoFields}
            }
          }
        }
      `,
      extract(data) {
        return data.projects;
      },
    });

    return {
      projects: projects.map((project) => mapProject(project)),
    };
  },

  async list_linear_states(input, context) {
    const states = await fetchTeamStates(context, getString(input.team_id));
    return {
      states: states.map(mapWorkflowState),
    };
  },

  async list_linear_teams(input, context) {
    const teams = await fetchAllConnectionNodes<any, any>(context, {
      query: `
        query ListTeams($after: String) {
          teams(after: $after, first: 100, includeArchived: false) {
            nodes {
              ${teamFields}
            }
            pageInfo {
              ${pageInfoFields}
            }
          }
        }
      `,
      extract(data) {
        return data.teams;
      },
    });

    const projectId = getOptionalString(input.project_id);
    const detailedTeams = await mapWithConcurrency(teams, 5, async (team) => {
      const teamId = asOptionalString(team.id);
      const detailedTeam = teamId ? await fetchTeamDetails(context, teamId) : team;

      return {
        ...mapTeam(detailedTeam),
        members: (detailedTeam.members?.nodes ?? []).map(mapUser),
        projects: (detailedTeam.projects?.nodes ?? [])
          .filter((project: any) => !projectId || String(project.id) === projectId)
          .map((project: any) => mapProject(project)),
      };
    });

    return {
      teams: detailedTeams,
    };
  },

  async list_linear_users(input, context) {
    const payload = await linearGraphqlOperation<{
      users?: LinearConnection<any>;
    }>(
      context,
      `
        query ListUsers($after: String, $first: Int) {
          users(
            after: $after
            first: $first
            includeArchived: false
            includeDisabled: true
          ) {
            nodes {
              ${userFields}
            }
            pageInfo {
              ${pageInfoFields}
            }
          }
        }
      `,
      {
        after: getOptionalString(input.after),
        first: getOptionalNumber(input.first),
      },
    );

    return {
      users: (payload.users?.nodes ?? []).map(mapUser),
      page_info: mapPageInfo(payload.users?.pageInfo),
    };
  },

  async remove_issue_label(input, context) {
    const issueId = getString(input.issue_id);
    const labelId = getString(input.label_id);
    const payload = await linearGraphqlOperation<{
      issueRemoveLabel?: { success?: boolean; issue?: { id?: string } };
    }>(
      context,
      `
        mutation RemoveIssueLabel($id: String!, $labelId: String!) {
          issueRemoveLabel(id: $id, labelId: $labelId) {
            success
            issue {
              id
            }
          }
        }
      `,
      {
        id: issueId,
        labelId,
      },
    );
    requireSuccessfulMutation(payload.issueRemoveLabel, "linear remove_issue_label failed");

    return {
      issue_id: issueId,
      label_id: labelId,
      removed: true,
    };
  },

  async remove_reaction(input, context) {
    const reactionId = getString(input.reaction_id);
    const payload = await linearGraphqlOperation<{
      reactionDelete?: { success?: boolean; entityId?: string };
    }>(
      context,
      `
        mutation RemoveReaction($id: String!) {
          reactionDelete(id: $id) {
            success
            entityId
          }
        }
      `,
      {
        id: reactionId,
      },
    );
    requireSuccessfulMutation(payload.reactionDelete, "linear remove_reaction failed");

    return {
      reaction_id: reactionId,
      removed: true,
    };
  },

  async run_query(input, context) {
    return executeRawGraphqlDocument(context, getString(input.query), getOptionalObject(input.variables));
  },

  async run_mutation(input, context) {
    return executeRawGraphqlDocument(context, getString(input.mutation), getOptionalObject(input.variables));
  },

  async search_issues(input, context) {
    const payload = await linearGraphqlOperation<{
      searchIssues?: LinearConnection<any> & { totalCount?: number };
    }>(
      context,
      `
        query SearchIssues($after: String, $first: Int, $includeArchived: Boolean, $term: String!) {
          searchIssues(
            after: $after
            first: $first
            includeArchived: $includeArchived
            term: $term
          ) {
            nodes {
              ${issueFields}
            }
            pageInfo {
              ${pageInfoFields}
            }
            totalCount
          }
        }
      `,
      {
        after: getOptionalString(input.after),
        first: getOptionalNumber(input.first),
        includeArchived: getOptionalBoolean(input.include_archived),
        term: getString(input.query),
      },
    );

    return {
      issues: (payload.searchIssues?.nodes ?? []).map(mapIssueSummary),
      page_info: mapPageInfo(payload.searchIssues?.pageInfo),
      total_count: typeof payload.searchIssues?.totalCount === "number" ? payload.searchIssues.totalCount : 0,
    };
  },

  async update_issue(input, context) {
    const payload = await linearGraphqlOperation<{
      issueUpdate?: { success?: boolean; issue?: { id?: string } };
    }>(
      context,
      `
        mutation UpdateIssue($id: String!, $input: IssueUpdateInput!) {
          issueUpdate(id: $id, input: $input) {
            success
            issue {
              id
            }
          }
        }
      `,
      {
        id: getString(input.issueId),
        input: compactObject({
          title: getOptionalString(input.title),
          teamId: getOptionalString(input.teamId),
          cycleId: getOptionalString(input.cycleId),
          dueDate: getOptionalString(input.dueDate),
          stateId: getOptionalString(input.stateId),
          estimate: getOptionalNumber(input.estimate),
          labelIds: getOptionalStringArray(input.labelIds),
          parentId: getOptionalString(input.parentId),
          priority: getOptionalNumber(input.priority),
          projectId: getOptionalString(input.projectId),
          assigneeId: getOptionalString(input.assigneeId),
          description: getOptionalString(input.description),
        }),
      },
    );

    const issueId = requireMutationEntityId(payload.issueUpdate, "issue", "linear update_issue failed");
    const issue = await fetchIssueById(context, issueId);

    return {
      issue: mapDetailedIssue(issue),
    };
  },

  async update_linear_comment(input, context) {
    const payload = await linearGraphqlOperation<{
      commentUpdate?: { success?: boolean; comment?: { id?: string } };
    }>(
      context,
      `
        mutation UpdateComment($id: String!, $input: CommentUpdateInput!) {
          commentUpdate(id: $id, input: $input) {
            success
            comment {
              id
            }
          }
        }
      `,
      {
        id: getString(input.comment_id),
        input: {
          body: getString(input.body),
        },
      },
    );

    const commentId = requireMutationEntityId(payload.commentUpdate, "comment", "linear update_linear_comment failed");
    const comment = await fetchCommentById(context, commentId);

    return {
      comment: mapComment(comment),
    };
  },

  async update_linear_project(input, context) {
    const requestedState = getOptionalString(input.state);
    const resolvedStatusId =
      getOptionalString(input.status_id) ??
      (requestedState ? await resolveProjectStatusId(context, requestedState) : undefined);

    const payload = await linearGraphqlOperation<{
      projectUpdate?: { success?: boolean; project?: { id?: string } };
    }>(
      context,
      `
        mutation UpdateProject($id: String!, $input: ProjectUpdateInput!) {
          projectUpdate(id: $id, input: $input) {
            success
            project {
              id
            }
          }
        }
      `,
      {
        id: getString(input.project_id),
        input: compactObject({
          icon: getOptionalString(input.icon),
          name: getOptionalString(input.name),
          color: getOptionalString(input.color),
          leadId: getOptionalString(input.lead_id),
          priority: getOptionalNumber(input.priority),
          statusId: resolvedStatusId,
          startDate: getOptionalString(input.start_date),
          description: getOptionalString(input.description),
          targetDate: getOptionalString(input.target_date),
        }),
      },
    );

    const projectId = requireMutationEntityId(payload.projectUpdate, "project", "linear update_linear_project failed");
    const project = await fetchProjectById(context, projectId, false, false, false);

    return {
      project: mapProject(project),
    };
  },
};

export const executors: ProviderExecutors = defineProviderExecutors<LinearActionContext>({
  service: "linear",
  handlers: linearActionHandlers,
  skipDnsValidation: true,
  async createContext(context: ExecutionContext, fetcher: typeof fetch): Promise<LinearActionContext> {
    const credential = await context.getCredential("linear");
    if (credential?.authType === "oauth2") {
      return {
        authorization: `Bearer ${credential.accessToken}`,
        fetcher,
      };
    }
    if (credential?.authType === "api_key") {
      return {
        authorization: credential.apiKey,
        fetcher,
      };
    }

    throw new ProviderRequestError(401, "Configure linear OAuth or API key credentials first.");
  },
});

export const proxy: ProviderProxyExecutor = async (input, context) => {
  try {
    const credential = await context.getCredential("linear");
    let authorization: string;
    if (credential?.authType === "oauth2") {
      authorization = `Bearer ${credential.accessToken}`;
    } else if (credential?.authType === "api_key") {
      authorization = credential.apiKey;
    } else {
      throw new ProviderRequestError(401, "Configure linear OAuth or API key credentials first.");
    }

    const url = createProviderProxyUrl(linearApiBaseUrl, input.endpoint, input.query);
    const headers = normalizeProviderProxyHeaders(input.headers);
    headers.set("authorization", authorization);
    headers.set("user-agent", providerUserAgent);

    const init: RequestInit = {
      method: input.method,
      headers,
      signal: context.signal,
    };
    if (input.body !== undefined) {
      init.body = typeof input.body === "string" ? input.body : JSON.stringify(input.body);
      if (!headers.has("content-type") && typeof input.body !== "string") {
        headers.set("content-type", "application/json");
      }
    }

    const response = await linearFetch(url, init);
    if (!response.ok) {
      const text = await readProviderProxyErrorMessage(response, "");
      throw new ProviderRequestError(response.status, text || `linear request failed with HTTP ${response.status}`);
    }

    return { ok: true, response: await readProviderProxyResponse(response) };
  } catch (error) {
    return toProviderProxyError(error, "linear request failed");
  }
};

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher }) {
    const viewer = await fetchLinearViewer(input.apiKey, fetcher);
    return {
      profile: mapLinearCredentialProfile(viewer),
      grantedScopes: ["read", "write", "issues:create", "comments:create"],
      metadata: {
        viewer,
      },
    };
  },
  async oauth2(input, { fetcher }) {
    const viewer = await fetchLinearViewer(`Bearer ${input.accessToken}`, fetcher);
    return {
      profile: mapLinearCredentialProfile(viewer),
      metadata: {
        viewer,
      },
    };
  },
};

export async function fetchLinearViewer(
  authorization: string,
  fetcher: typeof fetch,
): Promise<Record<string, unknown>> {
  const response = await linearGraphqlOperation<{ viewer?: any }>(
    { authorization, fetcher },
    `
      query Viewer {
        viewer {
          ${userFields}
        }
      }
    `,
    {},
  );

  if (!response.viewer) {
    throw new ProviderRequestError(502, "linear viewer query returned empty payload");
  }

  return response.viewer;
}

function mapLinearCredentialProfile(viewer: Record<string, unknown>): {
  accountId: string;
  displayName: string;
} {
  const accountId = getString(viewer.id);
  return {
    accountId,
    displayName:
      asOptionalString(viewer.displayName) ??
      asOptionalString(viewer.name) ??
      asOptionalString(viewer.email) ??
      accountId,
  };
}

async function linearGraphqlRequest<T>(
  authorization: string,
  fetcher: typeof fetch,
  query: string,
  variables?: Record<string, unknown>,
) {
  const response = await fetcher(linearGraphqlUrl, {
    method: "POST",
    headers: {
      authorization,
      "content-type": "application/json",
    },
    body: JSON.stringify(
      compactObject({
        query,
        variables,
      }),
    ),
  });

  const body = await readJson(response);
  if (!response.ok) {
    throwLinearHttpError(response.status, body);
  }

  return body as LinearGraphQLResponse<T>;
}

async function linearGraphqlOperation<T>(
  context: LinearActionContext,
  query: string,
  variables?: Record<string, unknown>,
) {
  const response = await linearGraphqlRequest<T>(context.authorization, context.fetcher, query, variables);

  if (response.errors && response.errors.length > 0) {
    throwLinearGraphQLErrors(response.errors);
  }

  if (response.data == null) {
    throw new ProviderRequestError(502, "linear graphql response did not include data");
  }

  return response.data;
}

async function executeRawGraphqlDocument(
  context: LinearActionContext,
  document: string,
  variables?: Record<string, unknown>,
) {
  const response = await linearGraphqlRequest<any>(context.authorization, context.fetcher, document, variables);

  return compactObject({
    data: response.data === null ? null : asOptionalObject(response.data),
    errors: response.errors,
    extensions: response.extensions,
    message:
      response.errors && response.errors.length > 0
        ? response.errors.map((error) => error.message).join("; ")
        : undefined,
  });
}

async function fetchAllConnectionNodes<TData, TNode>(
  context: LinearActionContext,
  input: {
    query: string;
    baseVariables?: Record<string, unknown>;
    extract(data: TData): LinearConnection<TNode> | null | undefined;
  },
) {
  const nodes: TNode[] = [];
  let after: string | undefined;

  for (;;) {
    const data = await linearGraphqlOperation<TData>(context, input.query, {
      ...(input.baseVariables ?? {}),
      after,
    });
    const connection = input.extract(data);
    if (!connection) {
      return nodes;
    }

    nodes.push(...(connection.nodes ?? []));

    const pageInfo = connection.pageInfo;
    if (!pageInfo?.hasNextPage || !pageInfo.endCursor) {
      return nodes;
    }

    after = pageInfo.endCursor;
  }
}

async function fetchIssueById(context: LinearActionContext, issueId: string) {
  const payload = await linearGraphqlOperation<{ issue?: any }>(
    context,
    `
      query GetIssue($id: String!) {
        issue(id: $id) {
          ${detailedIssueFields}
        }
      }
    `,
    {
      id: issueId,
    },
  );

  if (!payload.issue) {
    throw new ProviderRequestError(400, "linear issue not found");
  }

  return payload.issue;
}

async function fetchProjectById(
  context: LinearActionContext,
  projectId: string,
  includeTeams: boolean,
  includeMembers: boolean,
  includeInitiatives: boolean,
) {
  const payload = await linearGraphqlOperation<{ project?: any }>(
    context,
    `
      query GetProject(
        $id: String!
        $includeTeams: Boolean!
        $includeMembers: Boolean!
        $includeInitiatives: Boolean!
      ) {
        project(id: $id) {
          ${projectFields}
          teams(first: 50, includeArchived: false) @include(if: $includeTeams) {
            nodes {
              ${teamFields}
            }
          }
          members(first: 100, includeArchived: false, includeDisabled: true) @include(if: $includeMembers) {
            nodes {
              ${userFields}
            }
          }
          initiatives(first: 50, includeArchived: false) @include(if: $includeInitiatives) {
            nodes {
              ${initiativeFields}
            }
          }
        }
      }
    `,
    {
      id: projectId,
      includeTeams,
      includeMembers,
      includeInitiatives,
    },
  );

  if (!payload.project) {
    throw new ProviderRequestError(400, "linear project not found");
  }

  return payload.project;
}

async function fetchAttachmentById(context: LinearActionContext, attachmentId: string) {
  const payload = await linearGraphqlOperation<{ attachment?: any }>(
    context,
    `
      query GetAttachment($id: String!) {
        attachment(id: $id) {
          ${attachmentFields}
        }
      }
    `,
    {
      id: attachmentId,
    },
  );

  if (!payload.attachment) {
    throw new ProviderRequestError(400, "linear attachment not found");
  }

  return payload.attachment;
}

async function fetchIssueLabelById(context: LinearActionContext, labelId: string) {
  const payload = await linearGraphqlOperation<{ issueLabel?: any }>(
    context,
    `
      query GetIssueLabel($id: String!) {
        issueLabel(id: $id) {
          ${labelFields}
          team {
            ${teamFields}
          }
        }
      }
    `,
    {
      id: labelId,
    },
  );

  if (!payload.issueLabel) {
    throw new ProviderRequestError(400, "linear label not found");
  }

  return payload.issueLabel;
}

async function fetchCommentById(context: LinearActionContext, commentId: string) {
  const payload = await linearGraphqlOperation<{ comment?: any }>(
    context,
    `
      query GetComment($id: String!) {
        comment(id: $id) {
          ${commentFields}
        }
      }
    `,
    {
      id: commentId,
    },
  );

  if (!payload.comment) {
    throw new ProviderRequestError(400, "linear comment not found");
  }

  return payload.comment;
}

async function fetchIssueRelationById(context: LinearActionContext, relationId: string) {
  const payload = await linearGraphqlOperation<{ issueRelation?: any }>(
    context,
    `
      query GetIssueRelation($id: String!) {
        issueRelation(id: $id) {
          id
          type
          issue {
            id
          }
          relatedIssue {
            id
          }
        }
      }
    `,
    {
      id: relationId,
    },
  );

  if (!payload.issueRelation) {
    throw new ProviderRequestError(400, "linear issue relation not found");
  }

  return payload.issueRelation;
}

async function fetchProjectMilestoneById(context: LinearActionContext, milestoneId: string) {
  const payload = await linearGraphqlOperation<{ projectMilestone?: any }>(
    context,
    `
      query GetProjectMilestone($id: String!) {
        projectMilestone(id: $id) {
          id
          name
          description
          targetDate
          sortOrder
          progress
          status
          project {
            id
          }
        }
      }
    `,
    {
      id: milestoneId,
    },
  );

  if (!payload.projectMilestone) {
    throw new ProviderRequestError(400, "linear project milestone not found");
  }

  return payload.projectMilestone;
}

async function fetchProjectUpdateById(context: LinearActionContext, projectUpdateId: string) {
  const payload = await linearGraphqlOperation<{ projectUpdate?: any }>(
    context,
    `
      query GetProjectUpdate($id: String!) {
        projectUpdate(id: $id) {
          id
          body
          health
          isDiffHidden
          isStale
          url
          createdAt
          updatedAt
          editedAt
          slugId
          project {
            id
          }
          user {
            ${userFields}
          }
          reactions {
            ${reactionFields}
          }
          commentCount
        }
      }
    `,
    {
      id: projectUpdateId,
    },
  );

  if (!payload.projectUpdate) {
    throw new ProviderRequestError(400, "linear project update not found");
  }

  return payload.projectUpdate;
}

async function fetchIssueAttachments(context: LinearActionContext, issueId: string) {
  const payload = await linearGraphqlOperation<{
    issue?: { attachments?: LinearConnection<any> };
  }>(
    context,
    `
      query GetIssueAttachments($id: String!) {
        issue(id: $id) {
          attachments(first: 100, includeArchived: false) {
            nodes {
              ${attachmentFields}
            }
          }
        }
      }
    `,
    {
      id: issueId,
    },
  );

  if (!payload.issue) {
    throw new ProviderRequestError(400, "linear issue not found");
  }

  return payload.issue.attachments?.nodes ?? [];
}

async function fetchTeamCycles(context: LinearActionContext, teamId: string) {
  const payload = await linearGraphqlOperation<{
    team?: { cycles?: LinearConnection<any> };
  }>(
    context,
    `
      query GetTeamCycles($id: String!) {
        team(id: $id) {
          cycles(first: 100, includeArchived: false) {
            nodes {
              ${cycleFields}
            }
          }
        }
      }
    `,
    {
      id: teamId,
    },
  );

  if (!payload.team) {
    throw new ProviderRequestError(400, "linear team not found");
  }

  return payload.team.cycles?.nodes ?? [];
}

async function fetchTeamLabels(context: LinearActionContext, teamId: string) {
  const payload = await linearGraphqlOperation<{
    team?: { labels?: LinearConnection<any> };
  }>(
    context,
    `
      query GetTeamLabels($id: String!) {
        team(id: $id) {
          labels(first: 100, includeArchived: false) {
            nodes {
              ${labelFields}
            }
          }
        }
      }
    `,
    {
      id: teamId,
    },
  );

  if (!payload.team) {
    throw new ProviderRequestError(400, "linear team not found");
  }

  return payload.team.labels?.nodes ?? [];
}

async function fetchTeamStates(context: LinearActionContext, teamId: string) {
  const payload = await linearGraphqlOperation<{
    team?: { states?: LinearConnection<any> };
  }>(
    context,
    `
      query GetTeamStates($id: String!) {
        team(id: $id) {
          states(first: 100, includeArchived: false) {
            nodes {
              ${workflowStateFields}
            }
          }
        }
      }
    `,
    {
      id: teamId,
    },
  );

  if (!payload.team) {
    throw new ProviderRequestError(400, "linear team not found");
  }

  return payload.team.states?.nodes ?? [];
}

async function fetchTeamDetails(context: LinearActionContext, teamId: string) {
  const payload = await linearGraphqlOperation<{
    team?: any;
  }>(
    context,
    `
      query GetTeamDetails($id: String!) {
        team(id: $id) {
          ${teamFields}
          members(first: 100, includeDisabled: true) {
            nodes {
              ${userFields}
            }
          }
          projects(first: 100, includeArchived: false) {
            nodes {
              ${projectFields}
            }
          }
        }
      }
    `,
    {
      id: teamId,
    },
  );

  if (!payload.team) {
    throw new ProviderRequestError(400, "linear team not found");
  }

  return payload.team;
}

async function resolveAssigneeFilterId(context: LinearActionContext, assigneeId: string | undefined) {
  if (!assigneeId) {
    return undefined;
  }

  if (assigneeId !== "me") {
    return assigneeId;
  }

  const viewer = await fetchLinearViewer(context.authorization, context.fetcher);
  return String(viewer.id);
}

function buildIssuesFilter(projectId: string | undefined, assigneeId: string | undefined) {
  const filter = compactObject({
    project: projectId ? { id: { eq: projectId } } : undefined,
    assignee: assigneeId ? { id: { eq: assigneeId } } : undefined,
  });

  return Object.keys(filter).length > 0 ? filter : undefined;
}

async function resolveProjectStatusId(context: LinearActionContext, statusType: string) {
  const payload = await linearGraphqlOperation<{
    organization?: { projectStatuses?: Array<{ id?: string; type?: string }> };
  }>(
    context,
    `
      query GetProjectStatuses {
        organization {
          projectStatuses {
            id
            type
          }
        }
      }
    `,
    {},
  );

  const matched = (payload.organization?.projectStatuses ?? []).find((status) => status?.type === statusType);

  if (!matched?.id) {
    throw new ProviderRequestError(400, `linear project status not found for state ${statusType}`);
  }

  return String(matched.id);
}

function requireMutationEntityId(
  payload: { success?: boolean; [key: string]: any } | undefined,
  entityKey: string,
  fallbackMessage: string,
) {
  if (payload?.success !== true || !payload[entityKey]?.id) {
    throw new ProviderRequestError(502, fallbackMessage);
  }

  return String(payload[entityKey].id);
}

function requireArchiveEntityId(
  payload: { success?: boolean; entity?: { id?: string } } | undefined,
  fallbackMessage: string,
) {
  if (payload?.success !== true || !payload.entity?.id) {
    throw new ProviderRequestError(502, fallbackMessage);
  }

  return String(payload.entity.id);
}

function requireSuccessfulMutation(payload: { success?: boolean } | undefined, fallbackMessage: string) {
  if (payload?.success !== true) {
    throw new ProviderRequestError(502, fallbackMessage);
  }
}

function mapPageInfo(pageInfo: LinearPageInfo | null | undefined) {
  return {
    startCursor: pageInfo?.startCursor ?? null,
    endCursor: pageInfo?.endCursor ?? null,
    hasPreviousPage: Boolean(pageInfo?.hasPreviousPage),
    hasNextPage: Boolean(pageInfo?.hasNextPage),
  };
}

function mapSnakePageInfo(pageInfo: LinearPageInfo | null | undefined) {
  return {
    end_cursor: pageInfo?.endCursor ?? null,
    has_next_page: Boolean(pageInfo?.hasNextPage),
  };
}

function mapUser(user: any) {
  if (!user) {
    return null;
  }

  return compactObject({
    id: asOptionalString(user.id),
    name: asOptionalString(user.name),
    displayName: asOptionalString(user.displayName),
    email: asOptionalString(user.email),
    avatarUrl: asOptionalString(user.avatarUrl),
    active: typeof user.active === "boolean" ? user.active : undefined,
    admin: typeof user.admin === "boolean" ? user.admin : undefined,
    createdAt: asOptionalString(user.createdAt),
  });
}

function mapTeam(team: any) {
  if (!team) {
    return null;
  }

  return compactObject({
    id: asOptionalString(team.id),
    name: asOptionalString(team.name),
    key: asOptionalString(team.key),
  });
}

function mapWorkflowState(state: any) {
  if (!state) {
    return null;
  }

  return compactObject({
    id: asOptionalString(state.id),
    name: asOptionalString(state.name),
    type: asOptionalString(state.type),
    color: asOptionalString(state.color),
    description: asOptionalString(state.description),
  });
}

function mapLabel(label: any) {
  if (!label) {
    return null;
  }

  return compactObject({
    id: asOptionalString(label.id),
    name: asOptionalString(label.name),
    color: asOptionalString(label.color),
    description: asOptionalString(label.description),
    is_group: typeof label.isGroup === "boolean" ? label.isGroup : undefined,
    parent: label.parent
      ? compactObject({
          id: asOptionalString(label.parent.id),
          name: asOptionalString(label.parent.name),
        })
      : null,
  });
}

function mapCycle(cycle: any) {
  if (!cycle) {
    return null;
  }

  return compactObject({
    id: asOptionalString(cycle.id),
    name: asOptionalString(cycle.name),
    number: asOptionalNumber(cycle.number),
    description: asOptionalString(cycle.description),
    startsAt: asOptionalString(cycle.startsAt),
    endsAt: asOptionalString(cycle.endsAt),
    completedAt: asOptionalString(cycle.completedAt),
    isActive: asOptionalBoolean(cycle.isActive),
    isFuture: asOptionalBoolean(cycle.isFuture),
    isPast: asOptionalBoolean(cycle.isPast),
    team: mapTeam(cycle.team),
  });
}

function mapProjectStatus(status: any) {
  if (!status) {
    return null;
  }

  return compactObject({
    id: asOptionalString(status.id),
    name: asOptionalString(status.name),
    type: asOptionalString(status.type),
    color: asOptionalString(status.color),
    description: asOptionalString(status.description),
  });
}

function mapProject(
  project: any,
  options: {
    includeTeams?: boolean;
    includeMembers?: boolean;
    includeInitiatives?: boolean;
  } = {},
) {
  if (!project) {
    return null;
  }

  return compactObject({
    id: asOptionalString(project.id),
    name: asOptionalString(project.name),
    description: asOptionalString(project.description),
    url: asOptionalString(project.url),
    slugId: asOptionalString(project.slugId),
    icon: asOptionalString(project.icon),
    color: asOptionalString(project.color),
    state: asOptionalString(project.state),
    health: asOptionalString(project.health),
    progress: asOptionalNumber(project.progress),
    priority: asOptionalNumber(project.priority),
    priorityLabel: asOptionalString(project.priorityLabel),
    scope: asOptionalNumber(project.scope),
    startDate: asOptionalString(project.startDate),
    targetDate: asOptionalString(project.targetDate),
    createdAt: asOptionalString(project.createdAt),
    updatedAt: asOptionalString(project.updatedAt),
    lead: mapUser(project.lead),
    creator: mapUser(project.creator),
    status: mapProjectStatus(project.status),
    teams:
      options.includeTeams && project.teams
        ? {
            nodes: (project.teams.nodes ?? []).map(mapTeam),
          }
        : undefined,
    members:
      options.includeMembers && project.members
        ? {
            nodes: (project.members.nodes ?? []).map(mapUser),
          }
        : undefined,
    initiatives:
      options.includeInitiatives && project.initiatives
        ? {
            nodes: (project.initiatives.nodes ?? []).map((initiative: any) =>
              compactObject({
                id: asOptionalString(initiative.id),
                name: asOptionalString(initiative.name),
                description: asOptionalString(initiative.description),
                url: asOptionalString(initiative.url),
              }),
            ),
          }
        : undefined,
  });
}

function mapAttachment(attachment: any) {
  if (!attachment) {
    return null;
  }

  return compactObject({
    id: asOptionalString(attachment.id),
    title: asOptionalString(attachment.title),
    subtitle: asOptionalString(attachment.subtitle),
    url: asOptionalString(attachment.url),
    sourceType: asOptionalString(attachment.sourceType),
    metadata: asOptionalObject(attachment.metadata),
    source: asOptionalObject(attachment.source),
    issue: attachment.issue
      ? compactObject({
          id: asOptionalString(attachment.issue.id),
          identifier: asOptionalString(attachment.issue.identifier),
          title: asOptionalString(attachment.issue.title),
        })
      : null,
    createdAt: asOptionalString(attachment.createdAt),
    updatedAt: asOptionalString(attachment.updatedAt),
  });
}

function mapReaction(reaction: any) {
  if (!reaction) {
    return null;
  }

  return compactObject({
    id: asOptionalString(reaction.id),
    emoji: asOptionalString(reaction.emoji),
    createdAt: asOptionalString(reaction.createdAt),
    updatedAt: asOptionalString(reaction.updatedAt),
    user: mapUser(reaction.user),
    comment: reaction.comment
      ? {
          id: asOptionalString(reaction.comment.id),
        }
      : null,
    issue: reaction.issue
      ? compactObject({
          id: asOptionalString(reaction.issue.id),
          identifier: asOptionalString(reaction.issue.identifier),
        })
      : null,
    projectUpdate: reaction.projectUpdate
      ? {
          id: asOptionalString(reaction.projectUpdate.id),
        }
      : null,
  });
}

function mapComment(comment: any) {
  if (!comment) {
    return null;
  }

  return compactObject({
    id: asOptionalString(comment.id),
    body: asOptionalString(comment.body),
    url: asOptionalString(comment.url),
    quotedText: asOptionalString(comment.quotedText),
    createdAt: asOptionalString(comment.createdAt),
    updatedAt: asOptionalString(comment.updatedAt),
    editedAt: asOptionalString(comment.editedAt),
    resolvedAt: asOptionalString(comment.resolvedAt),
    issueId: asOptionalString(comment.issueId),
    parentId: asOptionalString(comment.parentId),
    projectUpdateId: asOptionalString(comment.projectUpdateId),
    user: mapUser(comment.user),
    reactions: Array.isArray(comment.reactions) ? comment.reactions.map(mapReaction) : [],
  });
}

function mapIssueSummary(issue: any) {
  if (!issue) {
    return null;
  }

  return compactObject({
    id: asOptionalString(issue.id),
    identifier: asOptionalString(issue.identifier),
    title: asOptionalString(issue.title),
    description: asOptionalString(issue.description),
    url: asOptionalString(issue.url),
    createdAt: asOptionalString(issue.createdAt),
    updatedAt: asOptionalString(issue.updatedAt),
    archivedAt: asOptionalString(issue.archivedAt),
    dueDate: asOptionalString(issue.dueDate),
    priority: asOptionalNumber(issue.priority),
    estimate: asOptionalNumber(issue.estimate),
    team: mapTeam(issue.team),
    state: mapWorkflowState(issue.state),
    project: mapProject(issue.project),
    assignee: mapUser(issue.assignee),
    labels: {
      nodes: (issue.labels?.nodes ?? []).map(mapLabel),
    },
  });
}

function mapDetailedIssue(issue: any) {
  const base = mapIssueSummary(issue);
  if (!base) {
    return null;
  }

  return compactObject({
    ...base,
    creator: mapUser(issue.creator),
    cycle: mapCycle(issue.cycle),
    parent: issue.parent
      ? compactObject({
          id: asOptionalString(issue.parent.id),
          identifier: asOptionalString(issue.parent.identifier),
          title: asOptionalString(issue.parent.title),
        })
      : null,
    attachments: {
      nodes: (issue.attachments?.nodes ?? []).map(mapAttachment),
      pageInfo: mapPageInfo(issue.attachments?.pageInfo),
    },
    comments: {
      nodes: (issue.comments?.nodes ?? []).map(mapComment),
      pageInfo: mapPageInfo(issue.comments?.pageInfo),
    },
    subscribers: {
      nodes: (issue.subscribers?.nodes ?? []).map(mapUser),
      pageInfo: mapPageInfo(issue.subscribers?.pageInfo),
    },
    reactions: Array.isArray(issue.reactions) ? issue.reactions.map(mapReaction) : [],
  });
}

function mapDraft(draft: any) {
  if (!draft) {
    return null;
  }

  return compactObject({
    id: asOptionalString(draft.id),
    data: asOptionalObject(draft.data),
    bodyData: asOptionalString(draft.bodyData),
    createdAt: asOptionalString(draft.createdAt),
    updatedAt: asOptionalString(draft.updatedAt),
    isAutogenerated: asOptionalBoolean(draft.isAutogenerated),
    team: mapTeam(draft.team),
    issue: draft.issue ? { id: asOptionalString(draft.issue.id) } : null,
    project: draft.project ? { id: asOptionalString(draft.project.id) } : null,
    projectUpdate: draft.projectUpdate ? { id: asOptionalString(draft.projectUpdate.id) } : null,
    user: mapUser(draft.user),
  });
}

async function readJson(response: Response) {
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

function throwLinearHttpError(status: number, body: Record<string, unknown>) {
  const message = extractErrorMessage(body);

  if (status === 400) {
    throw new ProviderRequestError(400, message);
  }
  if (status === 401) {
    throw new ProviderRequestError(401, message);
  }
  if (status === 429) {
    throw new ProviderRequestError(429, message);
  }

  throw new ProviderRequestError(502, message, status >= 500 ? 500 : status);
}

function throwLinearGraphQLErrors(errors: LinearGraphQLError[]) {
  const message = errors.map((error) => error.message).join("; ");
  const lowerMessage = message.toLowerCase();

  if (
    lowerMessage.includes("cannot query field") ||
    lowerMessage.includes("syntax error") ||
    lowerMessage.includes("entity not found") ||
    lowerMessage.includes("invalid") ||
    lowerMessage.includes("expected type") ||
    lowerMessage.includes("required type") ||
    lowerMessage.includes("must be")
  ) {
    throw new ProviderRequestError(400, message);
  }

  if (lowerMessage.includes("unauthorized") || lowerMessage.includes("authentication")) {
    throw new ProviderRequestError(401, message);
  }

  if (lowerMessage.includes("rate limit")) {
    throw new ProviderRequestError(429, message);
  }

  throw new ProviderRequestError(502, message);
}

function extractErrorMessage(body: Record<string, unknown>) {
  const directMessage = asOptionalString(body.message);
  if (directMessage) {
    return directMessage;
  }

  const errors = body.errors;
  if (Array.isArray(errors) && errors.length > 0) {
    const joined = errors
      .map((error) => (error && typeof error === "object" ? asOptionalString((error as any).message) : null))
      .filter(Boolean)
      .join("; ");
    if (joined) {
      return joined;
    }
  }

  return "linear request failed";
}

function basenameFromUrl(url: string) {
  const withoutQuery = url.includes("?") ? url.slice(0, url.indexOf("?")) : url;
  const lastSlash = withoutQuery.lastIndexOf("/");
  return lastSlash >= 0 ? withoutQuery.slice(lastSlash + 1) : withoutQuery;
}

async function mapWithConcurrency<T, U>(items: T[], concurrency: number, mapper: (item: T) => Promise<U>) {
  const results: U[] = [];
  for (let index = 0; index < items.length; index += concurrency) {
    results.push(...(await Promise.all(items.slice(index, index + concurrency).map(mapper))));
  }
  return results;
}

function getString(value: unknown) {
  if (typeof value !== "string" || value.length === 0) {
    throw new ProviderRequestError(400, "string input is required");
  }

  return value;
}

function getOptionalString(value: unknown) {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function getOptionalNumber(value: unknown) {
  return typeof value === "number" ? value : undefined;
}

function getOptionalBoolean(value: unknown) {
  return typeof value === "boolean" ? value : undefined;
}

function getOptionalObject(value: unknown) {
  return asOptionalObject(value);
}

function getStringArray(value: unknown) {
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(400, "string array input is required");
  }

  return value.map((item) => getString(item));
}

function getOptionalStringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return undefined;
  }

  return value.map((item) => getString(item));
}

function asOptionalString(value: unknown) {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function asOptionalNumber(value: unknown) {
  return typeof value === "number" ? value : undefined;
}

function asOptionalBoolean(value: unknown) {
  return typeof value === "boolean" ? value : undefined;
}

function asOptionalObject(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  return value as Record<string, unknown>;
}
