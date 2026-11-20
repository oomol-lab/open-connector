import type { AppStoreConnectContext, AppStoreConnectHandlers, ListRequest } from "./runtime-helpers.ts";

import {
  objectArray,
  optionalRecord,
  optionalString,
  compactObject,
  optionalBoolean,
  booleanString,
  pickOptionalString,
} from "../../core/cast.ts";
import { ProviderRequestError } from "../provider-runtime.ts";
import { requiredInputString } from "../provider-runtime.ts";
import {
  deleteResource,
  listResources,
  normalizeResource,
  readAppStoreConnectId,
  readCommaSeparatedList,
  readIncludedResource,
  readOptionalAppStoreConnectId,
  readPreReleaseVersionSummary,
  readRelationshipId,
  readResource,
  requestAppStoreConnect,
  resourcePath,
  toOneLinkage,
  toOptionalOneLinkage,
} from "./runtime-helpers.ts";

type RelationshipIdFields = Record<string, string>;

const ciProductRelationships: RelationshipIdFields = { appId: "app" };
const ciWorkflowRelationships: RelationshipIdFields = {
  ciProductId: "product",
  scmRepositoryId: "repository",
  ciXcodeVersionId: "xcodeVersion",
  ciMacOsVersionId: "macOsVersion",
};
const ciBuildRunRelationships: RelationshipIdFields = {
  ciWorkflowId: "workflow",
  ciProductId: "product",
  sourceBranchOrTagId: "sourceBranchOrTag",
  destinationBranchId: "destinationBranch",
  scmPullRequestId: "pullRequest",
};
const ciBuildActionRelationships: RelationshipIdFields = { ciBuildRunId: "buildRun" };
const scmRepositoryRelationships: RelationshipIdFields = {
  scmProviderId: "scmProvider",
  defaultBranchId: "defaultBranch",
};
const scmGitReferenceRelationships: RelationshipIdFields = { scmRepositoryId: "repository" };
const scmPullRequestRelationships: RelationshipIdFields = { scmRepositoryId: "repository" };

const ciProductLabel = "App Store Connect Xcode Cloud product";
const ciWorkflowLabel = "App Store Connect Xcode Cloud workflow";
const ciBuildRunLabel = "App Store Connect Xcode Cloud build run";
const ciBuildActionLabel = "App Store Connect Xcode Cloud build action";
const scmRepositoryLabel = "App Store Connect source repository";

export const appStoreConnectXcodeCloudHandlers: AppStoreConnectHandlers = {
  async list_ci_products(input, context) {
    const page = await listWithRelationshipIds(
      context,
      input,
      {
        path: "/v1/ciProducts",
        label: ciProductLabel,
        query: {
          "filter[app]": readOptionalAppStoreConnectId(input.appId, "appId"),
          "filter[productType]": pickOptionalString(input, "productType"),
        },
      },
      ciProductRelationships,
    );
    return { ciProducts: page.items, nextCursor: page.nextCursor, total: page.total };
  },

  async get_ci_product(input, context) {
    return {
      ciProduct: await getWithRelationshipIds(
        context,
        resourcePath("/v1/ciProducts", readAppStoreConnectId(input.ciProductId, "ciProductId")),
        ciProductLabel,
        ciProductRelationships,
      ),
    };
  },

  async delete_ci_product(input, context) {
    const ciProductId = readAppStoreConnectId(input.ciProductId, "ciProductId");
    await deleteResource(
      context,
      resourcePath("/v1/ciProducts", ciProductId),
      "Deleting the App Store Connect Xcode Cloud product",
    );
    return { id: ciProductId, deleted: true };
  },

  async list_ci_product_workflows(input, context) {
    const page = await listWithRelationshipIds(
      context,
      input,
      {
        path: resourcePath("/v1/ciProducts", readAppStoreConnectId(input.ciProductId, "ciProductId"), "workflows"),
        label: ciWorkflowLabel,
      },
      ciWorkflowRelationships,
    );
    return { ciWorkflows: page.items, nextCursor: page.nextCursor, total: page.total };
  },

  async list_ci_product_build_runs(input, context) {
    const page = await listWithRelationshipIds(
      context,
      input,
      {
        path: resourcePath("/v1/ciProducts", readAppStoreConnectId(input.ciProductId, "ciProductId"), "buildRuns"),
        label: ciBuildRunLabel,
        query: buildRunListQuery(input),
      },
      ciBuildRunRelationships,
    );
    return { ciBuildRuns: page.items, nextCursor: page.nextCursor, total: page.total };
  },

  async list_ci_product_primary_repositories(input, context) {
    return listProductRepositories(input, context, "primaryRepositories");
  },

  async list_ci_product_additional_repositories(input, context) {
    return listProductRepositories(input, context, "additionalRepositories");
  },

  async get_ci_workflow(input, context) {
    return {
      ciWorkflow: await getWithRelationshipIds(
        context,
        resourcePath("/v1/ciWorkflows", readAppStoreConnectId(input.ciWorkflowId, "ciWorkflowId")),
        ciWorkflowLabel,
        ciWorkflowRelationships,
      ),
    };
  },

  async create_ci_workflow(input, context) {
    const ciWorkflow = await writeWithRelationshipIds(
      context,
      {
        method: "POST",
        path: "/v1/ciWorkflows",
        type: "ciWorkflows",
        label: ciWorkflowLabel,
        attributes: {
          ...readWorkflowAttributes(input),

          name: requiredInputString(input.name, "name"),
          containerFilePath: requiredInputString(input.containerFilePath, "containerFilePath"),
        },
        relationships: {
          product: toOneLinkage("ciProducts", readAppStoreConnectId(input.ciProductId, "ciProductId")),
          repository: toOneLinkage("scmRepositories", readAppStoreConnectId(input.scmRepositoryId, "scmRepositoryId")),
          xcodeVersion: toOneLinkage(
            "ciXcodeVersions",
            readAppStoreConnectId(input.ciXcodeVersionId, "ciXcodeVersionId"),
          ),
          macOsVersion: toOneLinkage(
            "ciMacOsVersions",
            readAppStoreConnectId(input.ciMacOsVersionId, "ciMacOsVersionId"),
          ),
        },
      },
      ciWorkflowRelationships,
    );
    return { ciWorkflow };
  },

  async update_ci_workflow(input, context) {
    const ciWorkflowId = readAppStoreConnectId(input.ciWorkflowId, "ciWorkflowId");
    const attributes = compactObject(readWorkflowAttributes(input));
    const relationships = compactObject({
      xcodeVersion: toOptionalOneLinkage(
        "ciXcodeVersions",
        readOptionalAppStoreConnectId(input.ciXcodeVersionId, "ciXcodeVersionId"),
      ),
      macOsVersion: toOptionalOneLinkage(
        "ciMacOsVersions",
        readOptionalAppStoreConnectId(input.ciMacOsVersionId, "ciMacOsVersionId"),
      ),
    });

    if (Object.keys(attributes).length === 0 && Object.keys(relationships).length === 0) {
      throw new ProviderRequestError(400, "update_ci_workflow needs at least one workflow field to change");
    }

    const ciWorkflow = await writeWithRelationshipIds(
      context,
      {
        method: "PATCH",
        path: resourcePath("/v1/ciWorkflows", ciWorkflowId),
        type: "ciWorkflows",
        id: ciWorkflowId,
        label: ciWorkflowLabel,
        attributes,
        relationships,
      },
      ciWorkflowRelationships,
    );
    return { ciWorkflow };
  },

  async delete_ci_workflow(input, context) {
    const ciWorkflowId = readAppStoreConnectId(input.ciWorkflowId, "ciWorkflowId");
    await deleteResource(
      context,
      resourcePath("/v1/ciWorkflows", ciWorkflowId),
      "Deleting the App Store Connect Xcode Cloud workflow",
    );
    return { id: ciWorkflowId, deleted: true };
  },

  async list_ci_workflow_build_runs(input, context) {
    const page = await listWithRelationshipIds(
      context,
      input,
      {
        path: resourcePath("/v1/ciWorkflows", readAppStoreConnectId(input.ciWorkflowId, "ciWorkflowId"), "buildRuns"),
        label: ciBuildRunLabel,
        query: buildRunListQuery(input),
      },
      ciBuildRunRelationships,
    );
    return { ciBuildRuns: page.items, nextCursor: page.nextCursor, total: page.total };
  },

  async get_ci_workflow_repository(input, context) {
    return {
      scmRepository: await getWithRelationshipIds(
        context,
        resourcePath("/v1/ciWorkflows", readAppStoreConnectId(input.ciWorkflowId, "ciWorkflowId"), "repository"),
        scmRepositoryLabel,
        scmRepositoryRelationships,
      ),
    };
  },

  async get_ci_build_run(input, context) {
    return {
      ciBuildRun: await getWithRelationshipIds(
        context,
        resourcePath("/v1/ciBuildRuns", readAppStoreConnectId(input.ciBuildRunId, "ciBuildRunId")),
        ciBuildRunLabel,
        ciBuildRunRelationships,
      ),
    };
  },

  async start_ci_build_run(input, context) {
    const ciBuildRun = await writeWithRelationshipIds(
      context,
      {
        method: "POST",
        path: "/v1/ciBuildRuns",
        type: "ciBuildRuns",
        label: ciBuildRunLabel,
        attributes: { clean: optionalBoolean(input.clean) },
        relationships: {
          workflow: toOneLinkage("ciWorkflows", readAppStoreConnectId(input.ciWorkflowId, "ciWorkflowId")),
          sourceBranchOrTag: toOptionalOneLinkage(
            "scmGitReferences",
            readOptionalAppStoreConnectId(input.sourceBranchOrTagId, "sourceBranchOrTagId"),
          ),
          pullRequest: toOptionalOneLinkage(
            "scmPullRequests",
            readOptionalAppStoreConnectId(input.scmPullRequestId, "scmPullRequestId"),
          ),
        },
      },
      ciBuildRunRelationships,
    );
    return { ciBuildRun };
  },

  async list_ci_build_run_actions(input, context) {
    const page = await listWithRelationshipIds(
      context,
      input,
      {
        path: resourcePath("/v1/ciBuildRuns", readAppStoreConnectId(input.ciBuildRunId, "ciBuildRunId"), "actions"),
        label: ciBuildActionLabel,
      },
      ciBuildActionRelationships,
    );
    return { ciBuildActions: page.items, nextCursor: page.nextCursor, total: page.total };
  },

  async list_ci_build_run_builds(input, context) {
    const page = await listResources(context, input, {
      path: resourcePath("/v1/ciBuildRuns", readAppStoreConnectId(input.ciBuildRunId, "ciBuildRunId"), "builds"),
      label: "App Store Connect Xcode Cloud build run build list",
      query: {
        "filter[version]": pickOptionalString(input, "version"),
        "filter[preReleaseVersion.version]": pickOptionalString(input, "preReleaseVersion"),
        "filter[preReleaseVersion.platform]": pickOptionalString(input, "platform"),
        "filter[processingState]": pickOptionalString(input, "processingState"),
        "filter[betaAppReviewSubmission.betaReviewState]": pickOptionalString(input, "betaReviewState"),
        "filter[expired]": booleanString(input.expired),
        "sort": pickOptionalString(input, "sort"),
        "include": "preReleaseVersion",
      },
    });
    return {
      builds: page.resources.map((resource) => ({
        ...normalizeResource(resource, "App Store Connect build"),
        preReleaseVersion: readPreReleaseVersionSummary(
          readIncludedResource(resource, "preReleaseVersion", page.included),
        ),
      })),
      nextCursor: page.nextCursor,
      total: page.total,
    };
  },

  async get_ci_build_action(input, context) {
    return {
      ciBuildAction: await getWithRelationshipIds(
        context,
        resourcePath("/v1/ciBuildActions", readAppStoreConnectId(input.ciBuildActionId, "ciBuildActionId")),
        ciBuildActionLabel,
        ciBuildActionRelationships,
      ),
    };
  },

  async list_ci_build_action_artifacts(input, context) {
    const page = await listWithRelationshipIds(
      context,
      input,
      {
        path: buildActionPath(input, "artifacts"),
        label: "App Store Connect Xcode Cloud artifact",
      },
      {},
    );
    return { ciArtifacts: page.items, nextCursor: page.nextCursor, total: page.total };
  },

  async list_ci_build_action_issues(input, context) {
    const page = await listWithRelationshipIds(
      context,
      input,
      { path: buildActionPath(input, "issues"), label: "App Store Connect Xcode Cloud issue" },
      {},
    );
    return { ciIssues: page.items, nextCursor: page.nextCursor, total: page.total };
  },

  async list_ci_build_action_test_results(input, context) {
    const page = await listWithRelationshipIds(
      context,
      input,
      {
        path: buildActionPath(input, "testResults"),
        label: "App Store Connect Xcode Cloud test result",
      },
      {},
    );
    return { ciTestResults: page.items, nextCursor: page.nextCursor, total: page.total };
  },

  async get_ci_build_action_build_run(input, context) {
    return {
      ciBuildRun: await getWithRelationshipIds(
        context,
        buildActionPath(input, "buildRun"),
        ciBuildRunLabel,
        ciBuildRunRelationships,
      ),
    };
  },

  async get_ci_artifact(input, context) {
    return {
      ciArtifact: await getWithRelationshipIds(
        context,
        resourcePath("/v1/ciArtifacts", readAppStoreConnectId(input.ciArtifactId, "ciArtifactId")),
        "App Store Connect Xcode Cloud artifact",
        {},
      ),
    };
  },

  async get_ci_issue(input, context) {
    return {
      ciIssue: await getWithRelationshipIds(
        context,
        resourcePath("/v1/ciIssues", readAppStoreConnectId(input.ciIssueId, "ciIssueId")),
        "App Store Connect Xcode Cloud issue",
        {},
      ),
    };
  },

  async get_ci_test_result(input, context) {
    return {
      ciTestResult: await getWithRelationshipIds(
        context,
        resourcePath("/v1/ciTestResults", readAppStoreConnectId(input.ciTestResultId, "ciTestResultId")),
        "App Store Connect Xcode Cloud test result",
        {},
      ),
    };
  },

  async list_ci_mac_os_versions(input, context) {
    const page = await listWithRelationshipIds(
      context,
      input,
      { path: "/v1/ciMacOsVersions", label: "App Store Connect Xcode Cloud macOS version" },
      {},
    );
    return { ciMacOsVersions: page.items, nextCursor: page.nextCursor, total: page.total };
  },

  async get_ci_mac_os_version(input, context) {
    return {
      ciMacOsVersion: await getWithRelationshipIds(
        context,
        resourcePath("/v1/ciMacOsVersions", readAppStoreConnectId(input.ciMacOsVersionId, "ciMacOsVersionId")),
        "App Store Connect Xcode Cloud macOS version",
        {},
      ),
    };
  },

  async list_ci_mac_os_version_xcode_versions(input, context) {
    const page = await listWithRelationshipIds(
      context,
      input,
      {
        path: resourcePath(
          "/v1/ciMacOsVersions",
          readAppStoreConnectId(input.ciMacOsVersionId, "ciMacOsVersionId"),
          "xcodeVersions",
        ),
        label: "App Store Connect Xcode Cloud Xcode version",
      },
      {},
    );
    return { ciXcodeVersions: page.items, nextCursor: page.nextCursor, total: page.total };
  },

  async list_ci_xcode_versions(input, context) {
    const page = await listWithRelationshipIds(
      context,
      input,
      { path: "/v1/ciXcodeVersions", label: "App Store Connect Xcode Cloud Xcode version" },
      {},
    );
    return { ciXcodeVersions: page.items, nextCursor: page.nextCursor, total: page.total };
  },

  async get_ci_xcode_version(input, context) {
    return {
      ciXcodeVersion: await getWithRelationshipIds(
        context,
        resourcePath("/v1/ciXcodeVersions", readAppStoreConnectId(input.ciXcodeVersionId, "ciXcodeVersionId")),
        "App Store Connect Xcode Cloud Xcode version",
        {},
      ),
    };
  },

  async list_ci_xcode_version_mac_os_versions(input, context) {
    const page = await listWithRelationshipIds(
      context,
      input,
      {
        path: resourcePath(
          "/v1/ciXcodeVersions",
          readAppStoreConnectId(input.ciXcodeVersionId, "ciXcodeVersionId"),
          "macOsVersions",
        ),
        label: "App Store Connect Xcode Cloud macOS version",
      },
      {},
    );
    return { ciMacOsVersions: page.items, nextCursor: page.nextCursor, total: page.total };
  },

  async list_scm_providers(input, context) {
    const page = await listWithRelationshipIds(
      context,
      input,
      { path: "/v1/scmProviders", label: "App Store Connect source control provider" },
      {},
    );
    return { scmProviders: page.items, nextCursor: page.nextCursor, total: page.total };
  },

  async get_scm_provider(input, context) {
    return {
      scmProvider: await getWithRelationshipIds(
        context,
        resourcePath("/v1/scmProviders", readAppStoreConnectId(input.scmProviderId, "scmProviderId")),
        "App Store Connect source control provider",
        {},
      ),
    };
  },

  async list_scm_provider_repositories(input, context) {
    const page = await listWithRelationshipIds(
      context,
      input,
      {
        path: resourcePath(
          "/v1/scmProviders",
          readAppStoreConnectId(input.scmProviderId, "scmProviderId"),
          "repositories",
        ),
        label: scmRepositoryLabel,
      },
      scmRepositoryRelationships,
    );
    return { scmRepositories: page.items, nextCursor: page.nextCursor, total: page.total };
  },

  async list_scm_repositories(input, context) {
    const page = await listWithRelationshipIds(
      context,
      input,
      {
        path: "/v1/scmRepositories",
        label: scmRepositoryLabel,
        query: { "filter[id]": readCommaSeparatedList(input.scmRepositoryIds) },
      },
      scmRepositoryRelationships,
    );
    return { scmRepositories: page.items, nextCursor: page.nextCursor, total: page.total };
  },

  async get_scm_repository(input, context) {
    return {
      scmRepository: await getWithRelationshipIds(
        context,
        resourcePath("/v1/scmRepositories", readAppStoreConnectId(input.scmRepositoryId, "scmRepositoryId")),
        scmRepositoryLabel,
        scmRepositoryRelationships,
      ),
    };
  },

  async list_scm_repository_git_references(input, context) {
    const page = await listWithRelationshipIds(
      context,
      input,
      {
        path: resourcePath(
          "/v1/scmRepositories",
          readAppStoreConnectId(input.scmRepositoryId, "scmRepositoryId"),
          "gitReferences",
        ),
        label: "App Store Connect Git reference",
      },
      scmGitReferenceRelationships,
    );
    return { scmGitReferences: page.items, nextCursor: page.nextCursor, total: page.total };
  },

  async list_scm_repository_pull_requests(input, context) {
    const page = await listWithRelationshipIds(
      context,
      input,
      {
        path: resourcePath(
          "/v1/scmRepositories",
          readAppStoreConnectId(input.scmRepositoryId, "scmRepositoryId"),
          "pullRequests",
        ),
        label: "App Store Connect pull request",
      },
      scmPullRequestRelationships,
    );
    return { scmPullRequests: page.items, nextCursor: page.nextCursor, total: page.total };
  },

  async get_scm_git_reference(input, context) {
    return {
      scmGitReference: await getWithRelationshipIds(
        context,
        resourcePath("/v1/scmGitReferences", readAppStoreConnectId(input.scmGitReferenceId, "scmGitReferenceId")),
        "App Store Connect Git reference",
        scmGitReferenceRelationships,
      ),
    };
  },

  async get_scm_pull_request(input, context) {
    return {
      scmPullRequest: await getWithRelationshipIds(
        context,
        resourcePath("/v1/scmPullRequests", readAppStoreConnectId(input.scmPullRequestId, "scmPullRequestId")),
        "App Store Connect pull request",
        scmPullRequestRelationships,
      ),
    };
  },
};

async function listProductRepositories(
  input: Record<string, unknown>,
  context: AppStoreConnectContext,
  suffix: "primaryRepositories" | "additionalRepositories",
) {
  const page = await listWithRelationshipIds(
    context,
    input,
    {
      path: resourcePath("/v1/ciProducts", readAppStoreConnectId(input.ciProductId, "ciProductId"), suffix),
      label: scmRepositoryLabel,
    },
    scmRepositoryRelationships,
  );
  return { scmRepositories: page.items, nextCursor: page.nextCursor, total: page.total };
}

function buildRunListQuery(input: Record<string, unknown>): Record<string, string | undefined> {
  return {
    "filter[builds]": readOptionalAppStoreConnectId(input.buildId, "buildId"),
    "sort": pickOptionalString(input, "sort"),
  };
}

function buildActionPath(input: Record<string, unknown>, suffix: string): string {
  return resourcePath("/v1/ciBuildActions", readAppStoreConnectId(input.ciBuildActionId, "ciBuildActionId"), suffix);
}

function readWorkflowAttributes(input: Record<string, unknown>): Record<string, unknown> {
  return {
    name: pickOptionalString(input, "name"),
    description: optionalString(input.description),
    branchStartCondition: optionalRecord(input.branchStartCondition),
    tagStartCondition: optionalRecord(input.tagStartCondition),
    pullRequestStartCondition: optionalRecord(input.pullRequestStartCondition),
    scheduledStartCondition: optionalRecord(input.scheduledStartCondition),
    manualBranchStartCondition: optionalRecord(input.manualBranchStartCondition),
    manualTagStartCondition: optionalRecord(input.manualTagStartCondition),
    manualPullRequestStartCondition: optionalRecord(input.manualPullRequestStartCondition),
    actions: input.actions === undefined ? undefined : objectArray(input.actions, "actions"),
    isEnabled: optionalBoolean(input.isEnabled),
    isLockedForEditing: optionalBoolean(input.isLockedForEditing),
    clean: optionalBoolean(input.clean),
    containerFilePath: pickOptionalString(input, "containerFilePath"),
  };
}

function normalizeWithRelationshipIds(
  resource: Record<string, unknown>,
  label: string,
  fields: RelationshipIdFields,
): Record<string, unknown> {
  const normalized = normalizeResource(resource, label);
  for (const [field, relationship] of Object.entries(fields)) {
    normalized[field] = readRelationshipId(resource, relationship);
  }
  return normalized;
}

async function getWithRelationshipIds(
  context: AppStoreConnectContext,
  path: string,
  label: string,
  fields: RelationshipIdFields,
): Promise<Record<string, unknown>> {
  const { payload } = await requestAppStoreConnect(context, { path });
  return normalizeWithRelationshipIds(readResource(payload, label), label, fields);
}

async function listWithRelationshipIds(
  context: AppStoreConnectContext,
  input: Record<string, unknown>,
  request: ListRequest,
  fields: RelationshipIdFields,
) {
  const page = await listResources(context, input, request);
  return {
    items: page.resources.map((resource) => normalizeWithRelationshipIds(resource, request.label, fields)),
    nextCursor: page.nextCursor,
    total: page.total,
  };
}

async function writeWithRelationshipIds(
  context: AppStoreConnectContext,
  request: {
    method: "POST" | "PATCH";
    path: string;
    type: string;
    id?: string;
    label: string;
    attributes: Record<string, unknown>;
    relationships: Record<string, unknown>;
  },
  fields: RelationshipIdFields,
): Promise<Record<string, unknown>> {
  const attributes = compactObject(request.attributes);
  const relationships = compactObject(request.relationships);
  const { payload } = await requestAppStoreConnect(context, {
    method: request.method,
    path: request.path,
    body: {
      data: compactObject({
        type: request.type,
        id: request.id,
        attributes: Object.keys(attributes).length > 0 ? attributes : undefined,
        relationships: Object.keys(relationships).length > 0 ? relationships : undefined,
      }),
    },
  });
  return normalizeWithRelationshipIds(readResource(payload, request.label), request.label, fields);
}
