import {
  compactObject,
  optionalBoolean,
  optionalInteger as asOptionalInteger,
  optionalRecord,
  optionalString as asOptionalString,
} from "../../core/cast.ts";
import { ProviderRequestError } from "../provider-runtime.ts";
import { bitbucketActions } from "./actions.ts";
import { fetchBitbucketText } from "./http.ts";

class ConnectorError extends ProviderRequestError {
  constructor(_code: string, message: string, status: number, cause?: unknown) {
    super(status, message, cause);
  }
}

function asObject(value: unknown): Record<string, unknown> {
  return optionalRecord(value) ?? {};
}

export const bitbucketApiBaseUrl = "https://api.bitbucket.org/2.0";

type BitbucketContext = {
  accessToken: string;
  fetcher: typeof fetch;
};

type RequestOptions = {
  method?: string;
  query?: Record<string, string | number | boolean | undefined>;
  body?: Record<string, unknown>;
  noContent?: boolean;
};

type BitbucketRequestResult = {
  response: Response;
  payload: unknown;
};

export const bitbucketActionHandlers: Record<
  string,
  (input: Record<string, unknown>, context: BitbucketContext) => Promise<unknown>
> = Object.fromEntries(
  bitbucketActions.map((action) => [
    action.name,
    (input: Record<string, unknown>, context: BitbucketContext) => dispatchBitbucketAction(action.name, input, context),
  ]),
);

async function dispatchBitbucketAction(actionName: string, input: Record<string, unknown>, context: BitbucketContext) {
  switch (actionName) {
    case "get_current_user":
      return bitbucketRequest("/user", context);
    case "list_workspaces":
      return listRequest("/workspaces", "workspaces", input, context);
    case "get_workspace":
      return bitbucketRequest(`/workspaces/${pathValue(input.workspace)}`, context);
    case "list_workspace_members":
      return listRequest(`/workspaces/${pathValue(input.workspace)}/members`, "members", input, context);
    case "list_workspace_projects":
      return listRequest(`/workspaces/${pathValue(input.workspace)}/projects`, "projects", input, context);
    case "list_repositories":
      return listRequest(`/repositories/${pathValue(input.workspace)}`, "repositories", input, context);
    case "get_repository":
      return bitbucketRequest(repositoryPath(input), context);
    case "delete_repository":
      await bitbucketRequest(repositoryPath(input), context, {
        method: "DELETE",
        noContent: true,
      });
      return { ok: true };
    case "list_branches":
      return listRequest(`${repositoryPath(input)}/refs/branches`, "branches", input, context);
    case "get_branch":
      return bitbucketRequest(`${repositoryPath(input)}/refs/branches/${pathValue(input.branch)}`, context);
    case "create_branch":
      return bitbucketRequest(`${repositoryPath(input)}/refs/branches`, context, {
        method: "POST",
        body: {
          name: input.name,
          target: { hash: input.target },
        },
      });
    case "delete_branch":
      await bitbucketRequest(`${repositoryPath(input)}/refs/branches/${pathValue(input.branch)}`, context, {
        method: "DELETE",
        noContent: true,
      });
      return { ok: true };
    case "list_tags":
      return listRequest(`${repositoryPath(input)}/refs/tags`, "tags", input, context);
    case "list_commits":
      return listRequest(
        `${repositoryPath(input)}/commits${asOptionalString(input.revision) ? `/${pathValue(input.revision)}` : ""}`,
        "commits",
        input,
        context,
        {
          include: asOptionalString(input.include),
          exclude: asOptionalString(input.exclude),
        },
      );
    case "get_commit":
      return bitbucketRequest(`${repositoryPath(input)}/commit/${pathValue(input.commit)}`, context);
    case "list_pull_requests":
      return listRequest(`${repositoryPath(input)}/pullrequests`, "pullRequests", input, context, {
        state: asOptionalString(input.state),
      });
    case "get_pull_request":
      return bitbucketRequest(pullRequestPath(input), context);
    case "create_pull_request": {
      const destinationBranch = asOptionalString(input.destinationBranch);
      return bitbucketRequest(`${repositoryPath(input)}/pullrequests`, context, {
        method: "POST",
        body: compactObject({
          title: input.title,
          source: { branch: { name: input.sourceBranch } },
          destination: destinationBranch ? { branch: { name: destinationBranch } } : undefined,
          description: asOptionalString(input.description),
          close_source_branch: optionalBoolean(input.closeSourceBranch),
          draft: optionalBoolean(input.draft),
          reviewers: Array.isArray(input.reviewerUuids) ? input.reviewerUuids.map((uuid) => ({ uuid })) : undefined,
        }),
      });
    }
    case "merge_pull_request": {
      const { response, payload } = await bitbucketRequestWithResponse(`${pullRequestPath(input)}/merge`, context, {
        method: "POST",
        body: compactObject({
          type: "pullrequest",
          message: asOptionalString(input.message),
          close_source_branch: optionalBoolean(input.closeSourceBranch),
          merge_strategy: asOptionalString(input.mergeStrategy),
        }),
      });
      if (response.status === 202) {
        const mergeTask = readMergeTask(response.headers.get("location"), input);
        if (!mergeTask) {
          throw new ConnectorError("provider_error", "bitbucket merge response did not include a valid task ID", 502);
        }
        return {
          status: "queued",
          pullRequest: null,
          taskId: mergeTask.taskId,
          taskStatusUrl: mergeTask.taskStatusUrl,
        };
      }
      return {
        status: "completed",
        pullRequest: asBitbucketResponseObject(payload, "pull request merge response"),
        taskId: null,
        taskStatusUrl: null,
      };
    }
    case "get_pull_request_merge_task_status":
      return asBitbucketResponseObject(
        await bitbucketRequest(`${pullRequestPath(input)}/merge/task-status/${pathValue(input.taskId)}`, context),
        "pull request merge task response",
      );
    case "decline_pull_request":
      return bitbucketRequest(`${pullRequestPath(input)}/decline`, context, { method: "POST" });
    case "approve_pull_request":
      return bitbucketRequest(`${pullRequestPath(input)}/approve`, context, { method: "POST" });
    case "list_pull_request_comments":
      return listRequest(`${pullRequestPath(input)}/comments`, "comments", input, context);
    case "create_pull_request_comment":
      return bitbucketRequest(`${pullRequestPath(input)}/comments`, context, {
        method: "POST",
        body: { content: { raw: input.content } },
      });
    case "list_issues":
      return listRequest(`${repositoryPath(input)}/issues`, "issues", input, context);
    case "get_issue":
      return bitbucketRequest(issuePath(input), context);
    case "create_issue":
      return bitbucketRequest(`${repositoryPath(input)}/issues`, context, {
        method: "POST",
        body: compactObject({
          title: input.title,
          content: asOptionalString(input.content) ? { raw: asOptionalString(input.content) } : undefined,
          kind: asOptionalString(input.kind),
          priority: asOptionalString(input.priority),
        }),
      });
    case "update_issue":
      assertIssueUpdateInput(input);
      return bitbucketRequest(issuePath(input), context, {
        method: "PUT",
        body: compactObject({
          title: asOptionalString(input.title),
          content: input.content === undefined ? undefined : { raw: asOptionalString(input.content) },
          state: asOptionalString(input.state),
          kind: asOptionalString(input.kind),
          priority: asOptionalString(input.priority),
        }),
      });
    case "list_issue_comments":
      return listRequest(`${issuePath(input)}/comments`, "comments", input, context);
    case "create_issue_comment": {
      const { response } = await bitbucketRequestWithResponse(`${issuePath(input)}/comments`, context, {
        method: "POST",
        body: { content: { raw: input.content } },
      });
      return { created: true, location: response.headers.get("location") };
    }
    case "list_snippets":
      return listRequest(
        asOptionalString(input.workspace) ? `/snippets/${pathValue(input.workspace)}` : "/snippets",
        "snippets",
        input,
        context,
        { role: asOptionalString(input.role) },
      );
    case "get_snippet":
      return bitbucketRequest(`/snippets/${pathValue(input.workspace)}/${pathValue(input.snippetId)}`, context);
    case "list_pipelines":
      return listRequest(`${repositoryPath(input)}/pipelines`, "pipelines", input, context, {}, normalizePipeline);
    case "get_pipeline":
      return normalizePipeline(
        await bitbucketRequest(`${repositoryPath(input)}/pipelines/${pathValue(input.pipelineUuid)}`, context),
      );
    case "run_pipeline":
      return normalizePipeline(
        await bitbucketRequest(`${repositoryPath(input)}/pipelines`, context, {
          method: "POST",
          body: buildPipelineBody(input),
        }),
      );
    case "stop_pipeline":
      await bitbucketRequest(
        `${repositoryPath(input)}/pipelines/${pathValue(input.pipelineUuid)}/stopPipeline`,
        context,
        { method: "POST", noContent: true },
      );
      return { ok: true };
    case "list_pipeline_variables":
      return listRequest(`${repositoryPath(input)}/pipelines_config/variables`, "variables", input, context);
    case "create_pipeline_variable":
      return bitbucketRequest(`${repositoryPath(input)}/pipelines_config/variables`, context, {
        method: "POST",
        body: pipelineVariableBody(input),
      });
    case "update_pipeline_variable":
      return bitbucketRequest(
        `${repositoryPath(input)}/pipelines_config/variables/${pathValue(input.variableUuid)}`,
        context,
        { method: "PUT", body: pipelineVariableBody(input) },
      );
    case "delete_pipeline_variable":
      await bitbucketRequest(
        `${repositoryPath(input)}/pipelines_config/variables/${pathValue(input.variableUuid)}`,
        context,
        { method: "DELETE", noContent: true },
      );
      return { ok: true };
    case "list_repository_runners":
      return listRequest(`${repositoryPath(input)}/pipelines-config/runners`, "runners", input, context);
    default:
      throw new ConnectorError("invalid_input", `unknown bitbucket action: ${actionName}`, 400);
  }
}

function repositoryPath(input: Record<string, unknown>) {
  return `/repositories/${pathValue(input.workspace)}/${pathValue(input.repository)}`;
}

function pullRequestPath(input: Record<string, unknown>) {
  return `${repositoryPath(input)}/pullrequests/${pathValue(input.pullRequestId)}`;
}

function issuePath(input: Record<string, unknown>) {
  return `${repositoryPath(input)}/issues/${pathValue(input.issueId)}`;
}

function pathValue(value: unknown) {
  return encodeURIComponent(String(value));
}

function paginationQuery(input: Record<string, unknown>) {
  return compactObject({
    page: asOptionalInteger(input.page),
    pagelen: asOptionalInteger(input.pageLength),
    q: asOptionalString(input.query),
    sort: asOptionalString(input.sort),
  });
}

async function listRequest(
  path: string,
  collection: string,
  input: Record<string, unknown>,
  context: BitbucketContext,
  query: Record<string, string | number | boolean | undefined> = {},
  normalizeItem: (value: unknown) => unknown = (value) => value,
) {
  const payload = asBitbucketResponseObject(
    await bitbucketRequest(path, context, {
      query: { ...paginationQuery(input), ...query },
    }),
    "paginated response",
  );
  const values = asBitbucketResponseArray(payload.values, "paginated response values");
  return {
    [collection]: values.map(normalizeItem),
    page: asOptionalInteger(payload.page) ?? null,
    pageLength: asOptionalInteger(payload.pagelen) ?? null,
    size: asOptionalInteger(payload.size) ?? null,
    next: asOptionalString(payload.next) ?? null,
    previous: asOptionalString(payload.previous) ?? null,
  };
}

function buildPipelineBody(input: Record<string, unknown>) {
  const refType = asOptionalString(input.refType);
  const refName = asOptionalString(input.refName);
  const commitHash = asOptionalString(input.commitHash);
  if (refType === "commit" && !commitHash) {
    throw new ConnectorError("invalid_input", "commitHash is required for a commit target", 400);
  }
  if ((refType === "branch" || refType === "tag") && !refName) {
    throw new ConnectorError("invalid_input", "refName is required for a branch or tag target", 400);
  }

  const selectorType = asOptionalString(input.selectorType);
  const selectorPattern = asOptionalString(input.selectorPattern);
  if ((selectorType && !selectorPattern) || (!selectorType && selectorPattern)) {
    throw new ConnectorError("invalid_input", "selectorType and selectorPattern must be provided together", 400);
  }
  const selector = selectorType ? compactObject({ type: selectorType, pattern: selectorPattern }) : undefined;
  const target =
    refType === "commit"
      ? compactObject({
          type: "pipeline_commit_target",
          commit: { type: "commit", hash: commitHash },
          selector,
        })
      : compactObject({
          type: "pipeline_ref_target",
          ref_type: refType,
          ref_name: refName,
          commit: commitHash ? { type: "commit", hash: commitHash } : undefined,
          selector,
        });

  return compactObject({
    target,
    variables: Array.isArray(input.variables)
      ? input.variables.map((item) => pipelineVariableBody(asObject(item)))
      : undefined,
  });
}

function pipelineVariableBody(input: Record<string, unknown>) {
  return compactObject({
    key: input.key,
    value: input.value,
    secured: optionalBoolean(input.secured),
  });
}

async function bitbucketRequest(path: string, context: BitbucketContext, options: RequestOptions = {}) {
  const result = await bitbucketRequestWithResponse(path, context, options);
  if (options.noContent || result.response.status === 204) {
    return null;
  }
  const payload = asBitbucketResponseObject(result.payload, "api response");
  const errorMessage = readBitbucketErrorMessage(payload);
  if (errorMessage && Object.hasOwn(payload, "error")) {
    throw new ConnectorError("provider_error", errorMessage, 502);
  }
  return payload;
}

async function bitbucketRequestWithResponse(
  path: string,
  context: BitbucketContext,
  options: RequestOptions = {},
): Promise<BitbucketRequestResult> {
  const url = new URL(`${bitbucketApiBaseUrl}${path}`);
  for (const [key, value] of Object.entries(options.query ?? {})) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }

  const headers = new Headers({
    accept: "application/json",
    authorization: `Bearer ${context.accessToken}`,
  });
  if (options.body !== undefined) {
    headers.set("content-type", "application/json");
  }
  const { response, text } = await fetchBitbucketText(context.fetcher, url, {
    method: options.method ?? "GET",
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });

  const payload = readBitbucketPayload(response, text);
  if (!response.ok) {
    throw normalizeBitbucketError(response, payload);
  }
  return { response, payload };
}

function asBitbucketResponseObject(value: unknown, label: string) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ConnectorError("provider_error", `bitbucket ${label} is invalid`, 502);
  }
  return value as Record<string, unknown>;
}

function asBitbucketResponseArray(value: unknown, label: string) {
  if (!Array.isArray(value)) {
    throw new ConnectorError("provider_error", `bitbucket ${label} is invalid`, 502);
  }
  return value;
}

function readMergeTask(location: string | null, input: Record<string, unknown>) {
  if (!location) {
    return null;
  }
  try {
    const url = new URL(location, bitbucketApiBaseUrl);
    const expectedPathPrefix = new URL(`${bitbucketApiBaseUrl}${pullRequestPath(input)}/merge/task-status/`).pathname;
    if (url.origin !== new URL(bitbucketApiBaseUrl).origin || !url.pathname.startsWith(expectedPathPrefix)) {
      return null;
    }
    const encodedTaskId = url.pathname.slice(expectedPathPrefix.length);
    if (!encodedTaskId || encodedTaskId.includes("/")) {
      return null;
    }
    return { taskId: decodeURIComponent(encodedTaskId), taskStatusUrl: url.toString() };
  } catch {
    return null;
  }
}

function readBitbucketPayload(response: Response, text: string) {
  if (!text) {
    return null;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    if (response.ok) {
      throw new ConnectorError("provider_error", "bitbucket api returned invalid JSON", 502);
    }
    return { error: { message: text } };
  }
}

function normalizeBitbucketError(response: Response, payload: unknown) {
  const message = readBitbucketErrorMessage(payload) ?? `bitbucket api request failed with ${response.status}`;
  if (response.status === 401) {
    return new ConnectorError("credential_expired", message, 401);
  }
  if (response.status === 403) {
    const challenge = response.headers.get("www-authenticate")?.toLowerCase();
    return challenge?.includes("insufficient_scope") || challenge?.includes("insufficient scope")
      ? new ConnectorError("scope_missing", message, 403)
      : new ConnectorError("provider_error", message, 403);
  }
  if (response.status === 429) {
    return new ConnectorError("rate_limited", message, 429);
  }
  if (response.status === 400 || response.status === 404 || response.status === 409) {
    return new ConnectorError("invalid_input", message, response.status);
  }
  return new ConnectorError("provider_error", message, response.status);
}

function assertIssueUpdateInput(input: Record<string, unknown>) {
  if (["title", "content", "state", "kind", "priority"].some((field) => input[field] !== undefined)) {
    return;
  }
  throw new ConnectorError("invalid_input", "at least one issue field must be provided for update_issue", 400);
}

function normalizePipeline(value: unknown) {
  const pipeline = asBitbucketResponseObject(value, "pipeline response");
  if (!asOptionalString(pipeline.uuid)) {
    throw new ConnectorError("provider_error", "bitbucket pipeline UUID is missing", 502);
  }
  const state = asBitbucketResponseObject(pipeline.state, "pipeline state");
  const stateName = asOptionalString(state.name);
  if (stateName === "PENDING" || stateName === "IN_PROGRESS") {
    return { ...pipeline, status: "running" };
  }
  if (stateName === "COMPLETED") {
    const result = asBitbucketResponseObject(state.result, "pipeline completed result");
    const resultName = asOptionalString(result.name);
    if (resultName === "SUCCESSFUL") {
      return { ...pipeline, status: "succeeded" };
    }
    if (["FAILED", "ERROR", "STOPPED", "EXPIRED"].includes(resultName ?? "")) {
      return { ...pipeline, status: "failed" };
    }
  }
  throw new ConnectorError("provider_error", "bitbucket pipeline state is invalid", 502);
}

function readBitbucketErrorMessage(payload: unknown) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return undefined;
  }
  const error = (payload as Record<string, unknown>).error;
  if (error && typeof error === "object" && !Array.isArray(error)) {
    const detail = asOptionalString((error as Record<string, unknown>).detail);
    const message = asOptionalString((error as Record<string, unknown>).message);
    return detail ?? message;
  }
  return asOptionalString((payload as Record<string, unknown>).message);
}
