import type { PostmanActionName } from "./actions.ts";

import { compactObject, optionalScalarString, optionalString, requiredRecord } from "../../core/cast.ts";
import { ProviderRequestError, providerUserAgent } from "../provider-runtime.ts";

export const postmanApiBaseUrl = "https://api.getpostman.com";
const postmanDefaultAccept = "application/json";
const postmanV10Accept = "application/vnd.api.v10+json";

type RequestSpec = {
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  path: string;
  pathParams?: Record<string, string>;
  queryParams?: Record<string, string>;
  headers?: Record<string, string>;
  accept?: string;
  noContent?: boolean;
  bodyMode?: "remaining" | "none";
};

interface PostmanActionContext {
  apiKey: string;
  fetcher: typeof fetch;
}

export interface PostmanCredentialValidationResult {
  profile: {
    accountId: string;
    displayName: string;
  };
  grantedScopes: string[];
  metadata: Record<string, unknown>;
}

function withPostmanV10Request(spec: RequestSpec): RequestSpec {
  return {
    ...spec,
    accept: spec.accept ?? postmanV10Accept,
  };
}

export async function validatePostmanCredential(
  apiKey: string,
  fetcher: typeof fetch,
): Promise<PostmanCredentialValidationResult> {
  const payload = await requestPostmanJson<Record<string, unknown>>(
    {
      apiKey,
      method: "GET",
      path: "/me",
      phase: "validate",
    },
    fetcher,
  );

  const user = asObject(payload.user, "user");
  const id = asIdentifier(user.id, "user.id");
  const username = optionalString(user.username);
  const email = optionalString(user.email);
  const fullName = optionalString(user.fullName);

  return {
    profile: {
      accountId: id,
      displayName: fullName ?? username ?? email ?? id,
    },
    grantedScopes: [],
    metadata: compactObject({
      validationEndpoint: "/me",
      userId: id,
      username,
      email,
      fullName,
    }),
  };
}

export async function executePostmanAction(
  actionName: PostmanActionName,
  input: Record<string, unknown>,
  context: PostmanActionContext,
): Promise<unknown> {
  if (actionName === "import_openapi" && input.type === "file") {
    throw new ProviderRequestError(
      400,
      "import_openapi does not support file uploads in the current connector runtime",
    );
  }

  const spec = resolveRequestSpec(actionName);
  const request = buildRequest(spec, input);
  const payload = await requestPostmanResponse(
    {
      apiKey: context.apiKey,
      method: spec.method,
      path: request.path,
      query: request.query,
      body: request.body,
      headers: {
        ...spec.headers,
        accept: spec.accept ?? postmanDefaultAccept,
      },
      phase: "execute",
      noContent: spec.noContent === true,
    },
    context.fetcher,
  );

  if (spec.noContent && payload == null) {
    return { success: true };
  }

  return payload ?? {};
}

function resolveRequestSpec(actionName: PostmanActionName): RequestSpec {
  switch (actionName) {
    case "get_authenticated_user":
      return { method: "GET", path: "/me" };
    case "get_accounts":
      return { method: "GET", path: "/accounts" };
    case "list_account_invoices":
      return {
        method: "GET",
        path: "/accounts/{accountId}/invoices",
        pathParams: { accountId: "account_id" },
        queryParams: { status: "status" },
      };
    case "get_all_team_users":
      return { method: "GET", path: "/users" };
    case "get_a_team_user":
      return {
        method: "GET",
        path: "/users/{userId}",
        pathParams: { userId: "user_id" },
      };
    case "get_all_groups":
      return { method: "GET", path: "/groups" };
    case "get_resource_types":
      return { method: "GET", path: "/scim/v2/ResourceTypes" };
    case "get_service_provider_configuration":
      return { method: "GET", path: "/scim/v2/ServiceProviderConfig" };
    case "create_a_workspace":
      return { method: "POST", path: "/workspaces" };
    case "get_all_workspaces":
      return {
        method: "GET",
        path: "/workspaces",
        queryParams: { type: "type" },
        bodyMode: "none",
      };
    case "get_a_workspace":
      return {
        method: "GET",
        path: "/workspaces/{workspaceId}",
        pathParams: { workspaceId: "workspace_id" },
        bodyMode: "none",
      };
    case "update_a_workspace":
      return {
        method: "PUT",
        path: "/workspaces/{workspaceId}",
        pathParams: { workspaceId: "workspace_id" },
      };
    case "delete_a_workspace":
      return {
        method: "DELETE",
        path: "/workspaces/{workspaceId}",
        pathParams: { workspaceId: "workspace_id" },
        bodyMode: "none",
      };
    case "get_global_variables":
      return {
        method: "GET",
        path: "/workspaces/{workspaceId}/globals",
        pathParams: { workspaceId: "workspace_id" },
        bodyMode: "none",
      };
    case "update_global_variables":
      return {
        method: "PUT",
        path: "/workspaces/{workspaceId}/globals",
        pathParams: { workspaceId: "workspace_id" },
      };
    case "get_a_workspaces_activity_feed":
      return {
        method: "GET",
        path: "/workspaces/{workspaceId}/activities",
        pathParams: { workspaceId: "workspace_id" },
        queryParams: { limit: "limit", cursor: "cursor" },
        bodyMode: "none",
      };
    case "get_a_workspaces_roles":
      return {
        method: "GET",
        path: "/workspaces/{workspaceId}/roles",
        pathParams: { workspaceId: "workspace_id" },
        bodyMode: "none",
      };
    case "create_a_collection":
      return {
        method: "POST",
        path: "/collections",
        queryParams: { workspace: "workspace" },
      };
    case "get_all_collections2":
      return {
        method: "GET",
        path: "/collections",
        queryParams: { workspace: "workspace" },
        bodyMode: "none",
      };
    case "delete_a_collection":
      return {
        method: "DELETE",
        path: "/collections/{collectionId}",
        pathParams: { collectionId: "collection_id" },
        bodyMode: "none",
      };
    case "duplicate_a_collection":
      return {
        method: "POST",
        path: "/collections/{collectionId}/duplicates",
        pathParams: { collectionId: "collection_id" },
        queryParams: { workspace: "workspace" },
        headers: { prefer: "respond-async" },
      };
    case "get_duplication_task_status":
      return {
        method: "GET",
        path: "/collections/duplicates/{taskId}",
        pathParams: { taskId: "task_id" },
        bodyMode: "none",
      };
    case "replace_collections_data_asynchronously":
      return {
        method: "PUT",
        path: "/collections/{collectionId}",
        pathParams: { collectionId: "collection_id" },
        headers: { prefer: "respond-async" },
      };
    case "get_async_collection_update_status":
      return {
        method: "GET",
        path: "/collections/tasks/{taskId}",
        pathParams: { taskId: "task_id" },
        bodyMode: "none",
      };
    case "update_part_of_a_collection":
      return {
        method: "PATCH",
        path: "/collections/{collectionId}",
        pathParams: { collectionId: "collection_id" },
      };
    case "get_all_forked_collections":
      return {
        method: "GET",
        path: "/collections/forks",
        bodyMode: "none",
      };
    case "get_a_collections_forks":
      return {
        method: "GET",
        path: "/collections/{collectionId}/forks",
        pathParams: { collectionId: "collection_id" },
        bodyMode: "none",
      };
    case "fork_collection":
      return {
        method: "POST",
        path: "/collections/fork/{collectionId}",
        pathParams: { collectionId: "collection_id" },
        queryParams: { workspace: "workspace" },
      };
    case "merge_a_fork":
      return {
        method: "POST",
        path: "/collections/merge/{destination}",
        pathParams: { destination: "destination" },
      };
    case "get_source_collections_status":
      return {
        method: "GET",
        path: "/collections/{collectionId}/fork",
        pathParams: { collectionId: "collection_id" },
        bodyMode: "none",
      };
    case "pull_source_changes2":
      return {
        method: "POST",
        path: "/collections/{collectionId}/pull-changes",
        pathParams: { collectionId: "collection_id" },
        bodyMode: "none",
      };
    case "get_collection_access_keys":
      return {
        method: "GET",
        path: "/collections/access-keys",
        bodyMode: "none",
      };
    case "get_a_collections_pull_requests":
      return {
        method: "GET",
        path: "/collections/{collectionUid}/pull-requests",
        pathParams: { collectionUid: "collection_uid" },
        bodyMode: "none",
      };
    case "create_a_pull_request":
      return {
        method: "POST",
        path: "/collections/{collectionUid}/pull-requests",
        pathParams: { collectionUid: "collection_uid" },
      };
    case "update_a_pull_request":
      return {
        method: "PUT",
        path: "/pull-requests/{pullRequestId}",
        pathParams: { pullRequestId: "pull_request_id" },
      };
    case "review_a_pull_request":
      return {
        method: "PUT",
        path: "/pull-requests/{pullRequestId}/review",
        pathParams: { pullRequestId: "pull_request_id" },
      };
    case "get_a_collections_roles":
      return {
        method: "GET",
        path: "/collections/{collectionId}/roles",
        pathParams: { collectionId: "collection_id" },
        bodyMode: "none",
      };
    case "create_a_folder":
      return {
        method: "POST",
        path: "/collections/{collectionId}/folders",
        pathParams: { collectionId: "collection_id" },
      };
    case "get_a_folder":
      return {
        method: "GET",
        path: "/collections/{collectionId}/folders/{folderId}",
        pathParams: { collectionId: "collection_id", folderId: "folder_id" },
        bodyMode: "none",
      };
    case "update_a_folder":
      return {
        method: "PUT",
        path: "/collections/{collectionId}/folders/{folderId}",
        pathParams: { collectionId: "collection_id", folderId: "folder_id" },
      };
    case "delete_a_folder":
      return {
        method: "DELETE",
        path: "/collections/{collectionId}/folders/{folderId}",
        pathParams: { collectionId: "collection_id", folderId: "folder_id" },
        bodyMode: "none",
      };
    case "transfer_folders":
      return {
        method: "POST",
        path: "/collection-folders-transfers",
      };
    case "create_a_request":
      return {
        method: "POST",
        path: "/collections/{collectionId}/requests",
        pathParams: { collectionId: "collection_id" },
      };
    case "get_a_request":
      return {
        method: "GET",
        path: "/collections/{collectionId}/requests/{requestId}",
        pathParams: { collectionId: "collection_id", requestId: "request_id" },
        bodyMode: "none",
      };
    case "update_a_request":
      return {
        method: "PUT",
        path: "/collections/{collectionId}/requests/{requestId}",
        pathParams: { collectionId: "collection_id", requestId: "request_id" },
      };
    case "create_a_response":
      return {
        method: "POST",
        path: "/collections/{collectionId}/responses",
        pathParams: { collectionId: "collection_id" },
        queryParams: { request: "parent_request_id" },
      };
    case "get_a_response":
      return {
        method: "GET",
        path: "/collections/{collectionId}/responses/{responseId}",
        pathParams: { collectionId: "collection_id", responseId: "response_id" },
        bodyMode: "none",
      };
    case "update_a_response":
      return {
        method: "PUT",
        path: "/collections/{collectionId}/responses/{responseId}",
        pathParams: { collectionId: "collection_id", responseId: "response_id" },
      };
    case "delete_a_response":
      return {
        method: "DELETE",
        path: "/collections/{collectionId}/responses/{responseId}",
        pathParams: { collectionId: "collection_id", responseId: "response_id" },
        bodyMode: "none",
      };
    case "create_a_folder_comment":
      return {
        method: "POST",
        path: "/collections/{collectionUid}/folders/{folderUid}/comments",
        pathParams: { collectionUid: "collection_uid", folderUid: "folder_uid" },
      };
    case "get_a_folders_comments":
      return {
        method: "GET",
        path: "/collections/{collectionUid}/folders/{folderUid}/comments",
        pathParams: { collectionUid: "collection_uid", folderUid: "folder_uid" },
        bodyMode: "none",
      };
    case "update_a_folders_comment":
      return {
        method: "PUT",
        path: "/collections/{collectionUid}/folders/{folderUid}/comments/{commentId}",
        pathParams: {
          collectionUid: "collection_uid",
          folderUid: "folder_uid",
          commentId: "comment_id",
        },
      };
    case "delete_a_folders_comment":
      return {
        method: "DELETE",
        path: "/collections/{collectionUid}/folders/{folderUid}/comments/{commentId}",
        pathParams: {
          collectionUid: "collection_uid",
          folderUid: "folder_uid",
          commentId: "comment_id",
        },
        bodyMode: "none",
      };
    case "create_a_request_comment":
      return {
        method: "POST",
        path: "/collections/{collectionUid}/requests/{requestUid}/comments",
        pathParams: { collectionUid: "collection_uid", requestUid: "request_uid" },
      };
    case "get_a_requests_comments":
      return {
        method: "GET",
        path: "/collections/{collectionUid}/requests/{requestUid}/comments",
        pathParams: { collectionUid: "collection_uid", requestUid: "request_uid" },
        bodyMode: "none",
      };
    case "update_a_requests_comment":
      return {
        method: "PUT",
        path: "/collections/{collectionUid}/requests/{requestUid}/comments/{commentId}",
        pathParams: {
          collectionUid: "collection_uid",
          requestUid: "request_uid",
          commentId: "comment_id",
        },
      };
    case "delete_a_requests_comment":
      return {
        method: "DELETE",
        path: "/collections/{collectionUid}/requests/{requestUid}/comments/{commentId}",
        pathParams: {
          collectionUid: "collection_uid",
          requestUid: "request_uid",
          commentId: "comment_id",
        },
        bodyMode: "none",
      };
    case "create_a_response_comment":
      return {
        method: "POST",
        path: "/collections/{collectionUid}/responses/{responseUid}/comments",
        pathParams: { collectionUid: "collection_uid", responseUid: "response_uid" },
      };
    case "get_a_responses_comments":
      return {
        method: "GET",
        path: "/collections/{collectionUid}/responses/{responseUid}/comments",
        pathParams: { collectionUid: "collection_uid", responseUid: "response_uid" },
        bodyMode: "none",
      };
    case "update_a_responses_comment":
      return {
        method: "PUT",
        path: "/collections/{collectionUid}/responses/{responseUid}/comments/{commentId}",
        pathParams: {
          collectionUid: "collection_uid",
          responseUid: "response_uid",
          commentId: "comment_id",
        },
      };
    case "delete_a_responses_comment":
      return {
        method: "DELETE",
        path: "/collections/{collectionUid}/responses/{responseUid}/comments/{commentId}",
        pathParams: {
          collectionUid: "collection_uid",
          responseUid: "response_uid",
          commentId: "comment_id",
        },
        bodyMode: "none",
      };
    case "resolve_a_comment_thread":
      return {
        method: "PUT",
        path: "/comments/{threadId}/resolve",
        pathParams: { threadId: "thread_id" },
        bodyMode: "none",
      };
    case "create_an_environment":
      return {
        method: "POST",
        path: "/environments",
        queryParams: { workspace: "workspace_id" },
      };
    case "get_all_environments":
      return {
        method: "GET",
        path: "/environments",
        queryParams: { workspace: "workspace" },
        bodyMode: "none",
      };
    case "get_an_environment":
      return {
        method: "GET",
        path: "/environments/{environmentId}",
        pathParams: { environmentId: "environment_id" },
        bodyMode: "none",
      };
    case "update_an_environment":
      return {
        method: "PATCH",
        path: "/environments/{environmentId}",
        pathParams: { environmentId: "environment_id" },
      };
    case "replace_an_environments_data":
      return {
        method: "PUT",
        path: "/environments/{environmentId}",
        pathParams: { environmentId: "environment_id" },
      };
    case "delete_an_environment":
      return {
        method: "DELETE",
        path: "/environments/{environmentId}",
        pathParams: { environmentId: "environment_id" },
        bodyMode: "none",
      };
    case "create_a_fork2":
      return {
        method: "POST",
        path: "/environments/{environmentUid}/forks",
        pathParams: { environmentUid: "environment_uid" },
        queryParams: { workspace: "workspace" },
      };
    case "get_an_environments_forks":
      return {
        method: "GET",
        path: "/environments/{environmentUid}/forks",
        pathParams: { environmentUid: "environment_uid" },
        bodyMode: "none",
      };
    case "merge_a_fork2":
      return {
        method: "POST",
        path: "/environments/{environmentUid}/merge",
        pathParams: { environmentUid: "environment_uid" },
      };
    case "create_an_api":
      return withPostmanV10Request({
        method: "POST",
        path: "/apis",
        queryParams: { workspaceId: "workspace_id" },
      });
    case "get_all_apis":
      return withPostmanV10Request({
        method: "GET",
        path: "/apis",
        queryParams: { workspaceId: "workspace" },
        bodyMode: "none",
      });
    case "get_an_api":
      return withPostmanV10Request({
        method: "GET",
        path: "/apis/{apiId}",
        pathParams: { apiId: "api_id" },
        bodyMode: "none",
      });
    case "update_an_api":
      return withPostmanV10Request({
        method: "PUT",
        path: "/apis/{apiId}",
        pathParams: { apiId: "api_id" },
      });
    case "delete_an_api":
      return withPostmanV10Request({
        method: "DELETE",
        path: "/apis/{apiId}",
        pathParams: { apiId: "api_id" },
        bodyMode: "none",
        noContent: true,
      });
    case "get_all_versions":
      return withPostmanV10Request({
        method: "GET",
        path: "/apis/{apiId}/versions",
        pathParams: { apiId: "api_id" },
        bodyMode: "none",
      });
    case "get_an_api_version":
      return withPostmanV10Request({
        method: "GET",
        path: "/apis/{apiId}/versions/{apiVersionId}",
        pathParams: { apiId: "api_id", apiVersionId: "api_version_id" },
        bodyMode: "none",
      });
    case "get_all_api_releases":
      return {
        method: "GET",
        path: "/apis/{apiId}/versions/{apiVersionId}/releases",
        pathParams: { apiId: "api_id", apiVersionId: "api_version_id" },
        bodyMode: "none",
      };
    case "get_an_apis_comments":
      return {
        method: "GET",
        path: "/apis/{apiId}/comments",
        pathParams: { apiId: "api_id" },
        bodyMode: "none",
      };
    case "update_an_apis_comment":
      return {
        method: "PUT",
        path: "/apis/{apiId}/comments/{commentId}",
        pathParams: { apiId: "api_id", commentId: "comment_id" },
      };
    case "delete_an_apis_comment":
      return {
        method: "DELETE",
        path: "/apis/{apiId}/comments/{commentId}",
        pathParams: { apiId: "api_id", commentId: "comment_id" },
        bodyMode: "none",
        noContent: true,
      };
    case "create_a_collection_comment":
      return {
        method: "POST",
        path: "/apis/{apiId}/collections/{collectionId}/comments",
        pathParams: { apiId: "api_id", collectionId: "collection_id" },
      };
    case "get_a_collections_comments":
      return {
        method: "GET",
        path: "/apis/{apiId}/collections/{collectionId}/comments",
        pathParams: { apiId: "api_id", collectionId: "collection_id" },
        bodyMode: "none",
      };
    case "delete_a_collections_comment":
      return {
        method: "DELETE",
        path: "/apis/{apiId}/collections/{collectionId}/comments/{commentId}",
        pathParams: {
          apiId: "api_id",
          collectionId: "collection_id",
          commentId: "comment_id",
        },
        bodyMode: "none",
        noContent: true,
      };
    case "create_relations":
      return {
        method: "POST",
        path: "/apis/{apiId}/versions/{apiVersionId}/relations",
        pathParams: { apiId: "api_id", apiVersionId: "api_version_id" },
      };
    case "get_all_linked_relations":
      return {
        method: "GET",
        path: "/apis/{apiId}/versions/{apiVersionId}/relations",
        pathParams: { apiId: "api_id", apiVersionId: "api_version_id" },
        bodyMode: "none",
      };
    case "get_all_test_relations":
      return {
        method: "GET",
        path: "/apis/{apiId}/versions/{apiVersionId}/relations/test",
        pathParams: { apiId: "api_id", apiVersionId: "api_version_id" },
        bodyMode: "none",
      };
    case "get_contract_test_relations":
      return {
        method: "GET",
        path: "/apis/{apiId}/versions/{apiVersionId}/relations/contracttest",
        pathParams: { apiId: "api_id", apiVersionId: "api_version_id" },
        bodyMode: "none",
      };
    case "get_documentation_relations":
      return {
        method: "GET",
        path: "/apis/{apiId}/versions/{apiVersionId}/relations/documentation",
        pathParams: { apiId: "api_id", apiVersionId: "api_version_id" },
        bodyMode: "none",
      };
    case "get_environment_relations":
      return {
        method: "GET",
        path: "/apis/{apiId}/versions/{apiVersionId}/relations/environment",
        pathParams: { apiId: "api_id", apiVersionId: "api_version_id" },
        bodyMode: "none",
      };
    case "get_integration_test_relations":
      return {
        method: "GET",
        path: "/apis/{apiId}/versions/{apiVersionId}/relations/integrationtest",
        pathParams: { apiId: "api_id", apiVersionId: "api_version_id" },
        bodyMode: "none",
      };
    case "get_test_suite_relations":
      return {
        method: "GET",
        path: "/apis/{apiId}/versions/{apiVersionId}/relations/testsuite",
        pathParams: { apiId: "api_id", apiVersionId: "api_version_id" },
        bodyMode: "none",
      };
    case "get_unclassified_relations":
      return {
        method: "GET",
        path: "/apis/{apiId}/versions/{apiVersionId}/relations/unclassified",
        pathParams: { apiId: "api_id", apiVersionId: "api_version_id" },
        bodyMode: "none",
      };
    case "create_a_schema":
      return {
        method: "POST",
        path: "/apis/{apiId}/schemas",
        pathParams: { apiId: "api_id" },
        accept: postmanV10Accept,
      };
    case "get_a_schema":
      return {
        method: "GET",
        path: "/apis/{apiId}/schemas/{schemaId}",
        pathParams: { apiId: "api_id", schemaId: "schema_id" },
        queryParams: { versionId: "version_id" },
        accept: postmanV10Accept,
        bodyMode: "none",
      };
    case "get_schema_files":
      return {
        method: "GET",
        path: "/apis/{apiId}/schemas/{schemaId}/files",
        pathParams: { apiId: "api_id", schemaId: "schema_id" },
        queryParams: { versionId: "version_id" },
        accept: postmanV10Accept,
        bodyMode: "none",
      };
    case "get_schema_file_contents":
      return {
        method: "GET",
        path: "/apis/{apiId}/schemas/{schemaId}/files/{filePath}",
        pathParams: { apiId: "api_id", schemaId: "schema_id", filePath: "file_path" },
        queryParams: { versionId: "version_id" },
        accept: postmanV10Accept,
        bodyMode: "none",
      };
    case "create_or_update_a_schema_file":
      return {
        method: "PUT",
        path: "/apis/{apiId}/schemas/{schemaId}/files/{filePath}",
        pathParams: { apiId: "api_id", schemaId: "schema_id", filePath: "file_path" },
        accept: postmanV10Accept,
      };
    case "delete_a_schema_file":
      return {
        method: "DELETE",
        path: "/apis/{apiId}/schemas/{schemaId}/files/{filePath}",
        pathParams: { apiId: "api_id", schemaId: "schema_id", filePath: "file_path" },
        accept: postmanV10Accept,
        bodyMode: "none",
        noContent: true,
      };
    case "create_a_collection_from_a_schema":
      return {
        method: "POST",
        path: "/apis/{apiId}/versions/{apiVersionId}/schemas/{schemaId}/collections",
        pathParams: { apiId: "api_id", apiVersionId: "api_version_id", schemaId: "schema_id" },
        queryParams: { workspaceId: "workspace" },
        accept: postmanV10Accept,
      };
    case "sync_collection_with_schema":
      return {
        method: "POST",
        path: "/apis/{apiId}/collections/{collectionUid}/sync",
        pathParams: { apiId: "api_id", collectionUid: "collection_uid" },
        accept: postmanV10Accept,
        bodyMode: "none",
      };
    case "create_a_spec":
      return {
        method: "POST",
        path: "/specs",
        queryParams: { workspaceId: "workspace_id" },
      };
    case "get_all_specs":
      return {
        method: "GET",
        path: "/specs",
        queryParams: { workspaceId: "workspace_id" },
        bodyMode: "none",
      };
    case "get_a_spec":
      return {
        method: "GET",
        path: "/specs/{specId}",
        pathParams: { specId: "spec_id" },
        bodyMode: "none",
      };
    case "update_a_specs_properties":
      return {
        method: "PATCH",
        path: "/specs/{specId}",
        pathParams: { specId: "spec_id" },
      };
    case "delete_a_spec":
      return {
        method: "DELETE",
        path: "/specs/{specId}",
        pathParams: { specId: "spec_id" },
        bodyMode: "none",
        noContent: true,
      };
    case "get_a_specs_definition":
      return {
        method: "GET",
        path: "/specs/{specId}/definition",
        pathParams: { specId: "spec_id" },
        bodyMode: "none",
      };
    case "get_a_specs_files":
      return {
        method: "GET",
        path: "/specs/{specId}/files",
        pathParams: { specId: "spec_id" },
        bodyMode: "none",
      };
    case "get_a_spec_file":
      return {
        method: "GET",
        path: "/specs/{specId}/files/{filePath}",
        pathParams: { specId: "spec_id", filePath: "file_path" },
        bodyMode: "none",
      };
    case "create_a_spec_file":
      return {
        method: "POST",
        path: "/specs/{specId}/files",
        pathParams: { specId: "spec_id" },
      };
    case "update_a_spec_file":
      return {
        method: "PUT",
        path: "/specs/{specId}/files/{filePath}",
        pathParams: { specId: "spec_id", filePath: "file_path" },
      };
    case "delete_a_spec_file":
      return {
        method: "DELETE",
        path: "/specs/{specId}/files/{filePath}",
        pathParams: { specId: "spec_id", filePath: "file_path" },
        bodyMode: "none",
        noContent: true,
      };
    case "get_a_specs_generated_collections":
      return {
        method: "GET",
        path: "/specs/{specId}/generations/collection",
        pathParams: { specId: "spec_id" },
        bodyMode: "none",
      };
    case "generate_a_collection_from_spec":
      return {
        method: "POST",
        path: "/specs/{specId}/generations/collection",
        pathParams: { specId: "spec_id" },
      };
    case "sync_collection_with_spec":
      return {
        method: "PUT",
        path: "/collections/{collectionUid}/synchronizations",
        pathParams: { collectionUid: "collection_uid" },
        queryParams: { specId: "spec_id" },
        bodyMode: "none",
      };
    case "sync_spec_with_collection":
      return {
        method: "PUT",
        path: "/specs/{specId}/synchronizations",
        pathParams: { specId: "spec_id" },
        queryParams: { collectionUid: "collection_uid" },
        bodyMode: "none",
      };
    case "generate_spec_from_collection":
      return {
        method: "POST",
        path: "/collections/{collectionUid}/generations/spec",
        pathParams: { collectionUid: "collection_uid" },
      };
    case "get_generated_spec":
      return {
        method: "GET",
        path: "/collections/{collectionUid}/generations/spec",
        pathParams: { collectionUid: "collection_uid" },
        bodyMode: "none",
      };
    case "import_openapi":
      return {
        method: "POST",
        path: "/import/openapi",
        queryParams: { workspace: "workspace" },
      };
    case "transform_collection_to_openapi":
      return {
        method: "POST",
        path: "/collections/{collectionId}/transformations",
        pathParams: { collectionId: "collection_id" },
        bodyMode: "none",
      };
    case "create_a_mock_server":
      return {
        method: "POST",
        path: "/mocks",
        queryParams: { workspace: "workspace" },
      };
    case "get_all_mock_servers":
      return {
        method: "GET",
        path: "/mocks",
        queryParams: { workspace: "workspace" },
        bodyMode: "none",
      };
    case "update_a_mock_server":
      return {
        method: "PUT",
        path: "/mocks/{mockId}",
        pathParams: { mockId: "mock_id" },
      };
    case "publish_a_mock_server":
      return {
        method: "POST",
        path: "/mocks/{mockId}/publish",
        pathParams: { mockId: "mock_id" },
        bodyMode: "none",
      };
    case "create_a_server_response":
      return {
        method: "POST",
        path: "/mocks/{mockId}/server-responses",
        pathParams: { mockId: "mock_id" },
      };
    case "update_a_server_response":
      return {
        method: "PUT",
        path: "/mocks/{mockId}/server-responses/{serverResponseId}",
        pathParams: { mockId: "mock_id", serverResponseId: "server_response_id" },
      };
    case "delete_a_server_response":
      return {
        method: "DELETE",
        path: "/mocks/{mockId}/server-responses/{serverResponseId}",
        pathParams: { mockId: "mock_id", serverResponseId: "server_response_id" },
        bodyMode: "none",
      };
    case "create_a_monitor":
      return {
        method: "POST",
        path: "/monitors",
        queryParams: { workspace: "workspace" },
      };
    case "get_all_monitors":
      return {
        method: "GET",
        path: "/monitors",
        queryParams: { workspace: "workspace" },
        bodyMode: "none",
      };
    case "get_a_monitor":
      return {
        method: "GET",
        path: "/monitors/{monitorId}",
        pathParams: { monitorId: "monitor_id" },
        bodyMode: "none",
      };
    case "update_a_monitor":
      return {
        method: "PUT",
        path: "/monitors/{monitorId}",
        pathParams: { monitorId: "monitor_id" },
      };
    case "delete_monitor":
      return {
        method: "DELETE",
        path: "/monitors/{monitorId}",
        pathParams: { monitorId: "monitor_id" },
        bodyMode: "none",
      };
    case "run_a_monitor":
      return {
        method: "POST",
        path: "/monitors/{monitorId}/run",
        pathParams: { monitorId: "monitor_id" },
        bodyMode: "none",
      };
    case "create_a_webhook":
      return {
        method: "POST",
        path: "/webhooks",
        queryParams: { workspace: "workspace" },
      };
  }

  const exhaustiveActionName: never = actionName;
  throw new ProviderRequestError(400, `unknown postman action: ${exhaustiveActionName}`);
}

function buildRequest(
  spec: RequestSpec,
  input: Record<string, unknown>,
): {
  path: string;
  query: URLSearchParams;
  body: unknown;
} {
  const usedKeys = new Set<string>();
  let path = spec.path;
  for (const [targetKey, sourceKey] of Object.entries(spec.pathParams ?? {})) {
    const rawValue = input[sourceKey];
    if (rawValue == null || rawValue === "") {
      throw new ProviderRequestError(400, `${sourceKey} is required`);
    }
    usedKeys.add(sourceKey);
    path = path.replace(`{${targetKey}}`, encodePathValue(targetKey, rawValue));
  }

  const query = new URLSearchParams();
  for (const [targetKey, sourceKey] of Object.entries(spec.queryParams ?? {})) {
    const rawValue = input[sourceKey];
    usedKeys.add(sourceKey);
    if (rawValue == null || rawValue === "") {
      continue;
    }
    appendSearchParam(query, targetKey, rawValue);
  }

  const body =
    spec.bodyMode === "none" || spec.method === "GET" || spec.method === "DELETE"
      ? undefined
      : buildBodyPayload(input, usedKeys);

  return {
    path,
    query,
    body,
  };
}

function buildBodyPayload(input: Record<string, unknown>, usedKeys: Set<string>): Record<string, unknown> | undefined {
  const payload = Object.fromEntries(
    Object.entries(input)
      .filter(([key, value]) => !usedKeys.has(key) && value !== undefined)
      .map(([key, value]) => [toRequestKey(key), toRequestValue(value)]),
  );

  return Object.keys(payload).length > 0 ? payload : undefined;
}

async function requestPostmanJson<T>(
  input: {
    apiKey: string;
    method: string;
    path: string;
    query?: URLSearchParams;
    body?: unknown;
    headers?: Record<string, string>;
    phase: "validate" | "execute";
  },
  fetcher: typeof fetch,
): Promise<T> {
  const payload = await requestPostmanResponse(
    {
      ...input,
      noContent: false,
    },
    fetcher,
  );

  return payload as T;
}

async function requestPostmanResponse(
  input: {
    apiKey: string;
    method: string;
    path: string;
    query?: URLSearchParams;
    body?: unknown;
    headers?: Record<string, string>;
    phase: "validate" | "execute";
    noContent: boolean;
  },
  fetcher: typeof fetch,
): Promise<unknown> {
  const url = new URL(`${postmanApiBaseUrl}${input.path}`);
  for (const [key, value] of (input.query ?? new URLSearchParams()).entries()) {
    url.searchParams.append(key, value);
  }

  let response: Response;
  try {
    response = await fetcher(url.toString(), {
      method: input.method,
      headers: {
        accept: input.headers?.accept ?? postmanDefaultAccept,
        "user-agent": providerUserAgent,
        "x-api-key": input.apiKey,
        ...(input.body === undefined ? {} : { "content-type": "application/json" }),
        ...input.headers,
      },
      body: input.body === undefined ? undefined : JSON.stringify(input.body),
    });
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    const phaseLabel = input.phase === "validate" ? "credential validation" : "request";
    const message =
      error instanceof Error && error.message
        ? `Failed to connect to Postman API during ${phaseLabel}: ${error.message}`
        : `Failed to connect to Postman API during ${phaseLabel}`;
    throw new ProviderRequestError(502, message);
  }

  const payload = await readResponsePayload(response);

  if (!response.ok) {
    throw toPostmanError(response, payload, input.phase);
  }

  if (input.noContent && response.status === 204) {
    return null;
  }

  return payload;
}

async function readResponsePayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function toPostmanError(response: Response, payload: unknown, phase: "validate" | "execute"): ProviderRequestError {
  const message =
    readErrorMessage(payload) ??
    `Postman ${phase === "validate" ? "credential validation" : "request"} failed with ${response.status}`;

  if (response.status === 401) {
    return new ProviderRequestError(phase === "validate" ? 400 : 401, message, payload);
  }
  if (response.status === 403) {
    return new ProviderRequestError(403, message, payload);
  }
  if (response.status === 404) {
    return new ProviderRequestError(404, message, payload);
  }
  if (response.status === 400 || response.status === 409 || response.status === 422) {
    return new ProviderRequestError(400, message, payload);
  }
  if (response.status === 429) {
    return new ProviderRequestError(429, message, payload);
  }

  return new ProviderRequestError(response.status || 502, message, payload);
}

function readErrorMessage(payload: unknown): string | null {
  if (typeof payload === "string" && payload) {
    return payload;
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return null;
  }

  const record = payload as Record<string, unknown>;
  const candidates = [
    record.error,
    record.message,
    record.status,
    optionalString((record.errors as Record<string, unknown> | undefined)?.message),
  ];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate) {
      return candidate;
    }
  }
  return null;
}

function appendSearchParam(query: URLSearchParams, key: string, value: unknown): void {
  if (Array.isArray(value)) {
    for (const item of value) {
      appendSearchParam(query, key, item);
    }
    return;
  }
  query.append(key, String(value));
}

function encodePathValue(key: string, value: unknown): string {
  const raw = String(value);
  if (key.toLowerCase().includes("path")) {
    return raw
      .split("/")
      .filter(Boolean)
      .map((segment) => encodeURIComponent(segment))
      .join("/");
  }
  return encodeURIComponent(raw);
}

function toRequestKey(key: string): string {
  if (key.startsWith("_")) {
    return key;
  }

  let result = "";
  for (let index = 0; index < key.length; index += 1) {
    const char = key[index];
    const nextChar = key[index + 1];
    if (char === "_" && nextChar && nextChar >= "a" && nextChar <= "z") {
      result += nextChar.toUpperCase();
      index += 1;
      continue;
    }
    result += char;
  }
  return result;
}

function toRequestValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => toRequestValue(item));
  }
  if (!value || typeof value !== "object") {
    return value;
  }
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, child]) => [toRequestKey(key), toRequestValue(child)]),
  );
}

function asObject(value: unknown, fieldName: string): Record<string, unknown> {
  return requiredRecord(
    value,
    fieldName,
    () => new ProviderRequestError(502, `${fieldName} is missing from the Postman response`),
  );
}

function asIdentifier(value: unknown, fieldName: string): string {
  const identifier = optionalScalarString(value);
  if (identifier) {
    return identifier;
  }
  throw new ProviderRequestError(502, `${fieldName} is missing from the Postman response`);
}
