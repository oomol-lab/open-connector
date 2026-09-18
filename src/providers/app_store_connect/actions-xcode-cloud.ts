import type { ProviderActionDefinition } from "../../core/provider-definition.ts";
import type { JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";
import { service } from "./schemas.ts";
import {
  betaReviewStates,
  buildAudienceTypes,
  buildProcessingStates,
  buildResource,
  contentPlatforms,
  deletedOutput,
  manageXcodeCloudRoles,
  nonEmptyString,
  nullableEnum,
  pageOutput,
  paginationInputs,
  resourceObject,
} from "./schemas.ts";

export const ciProductTypes: readonly string[] = ["APP", "FRAMEWORK"];
export const ciExecutionProgresses: readonly string[] = ["PENDING", "RUNNING", "COMPLETE"];
export const ciCompletionStatuses: readonly string[] = ["SUCCEEDED", "FAILED", "ERRORED", "CANCELED", "SKIPPED"];
export const ciStartReasons: readonly string[] = [
  "GIT_REF_CHANGE",
  "MANUAL",
  "MANUAL_REBUILD",
  "PULL_REQUEST_OPEN",
  "PULL_REQUEST_UPDATE",
  "SCHEDULE",
];
export const ciCancelReasons: readonly string[] = ["AUTOMATICALLY_BY_NEWER_BUILD", "MANUALLY_BY_USER"];
export const ciActionTypes: readonly string[] = ["BUILD", "ANALYZE", "TEST", "ARCHIVE"];
export const ciActionDestinations: readonly string[] = [
  "ANY_IOS_DEVICE",
  "ANY_IOS_SIMULATOR",
  "ANY_TVOS_DEVICE",
  "ANY_TVOS_SIMULATOR",
  "ANY_WATCHOS_DEVICE",
  "ANY_WATCHOS_SIMULATOR",
  "ANY_MAC",
  "ANY_MAC_CATALYST",
  "ANY_VISIONOS_DEVICE",
  "ANY_VISIONOS_SIMULATOR",
];
export const ciActionPlatforms: readonly string[] = ["MACOS", "IOS", "TVOS", "WATCHOS", "VISIONOS"];
export const ciTestConfigurationKinds: readonly string[] = ["USE_SCHEME_SETTINGS", "SPECIFIC_TEST_PLANS"];
export const ciTestDestinationKinds: readonly string[] = ["SIMULATOR", "MAC"];
export const ciFilesAndFoldersRuleModes: readonly string[] = [
  "START_IF_ANY_FILE_MATCHES",
  "DO_NOT_START_IF_ALL_FILES_MATCH",
];
export const ciScheduleFrequencies: readonly string[] = ["WEEKLY", "DAILY", "HOURLY"];
export const ciScheduleDays: readonly string[] = [
  "SUNDAY",
  "MONDAY",
  "TUESDAY",
  "WEDNESDAY",
  "THURSDAY",
  "FRIDAY",
  "SATURDAY",
];
export const ciArtifactFileTypes: readonly string[] = [
  "ARCHIVE",
  "ARCHIVE_EXPORT",
  "LOG_BUNDLE",
  "RESULT_BUNDLE",
  "TEST_PRODUCTS",
  "XCODEBUILD_PRODUCTS",
  "STAPLED_NOTARIZED_ARCHIVE",
];
export const ciIssueTypes: readonly string[] = ["ANALYZER_WARNING", "ERROR", "TEST_FAILURE", "WARNING"];
export const ciTestStatuses: readonly string[] = ["SUCCESS", "FAILURE", "MIXED", "SKIPPED", "EXPECTED_FAILURE"];
export const scmProviderKinds: readonly string[] = [
  "BITBUCKET_CLOUD",
  "BITBUCKET_SERVER",
  "GITHUB_CLOUD",
  "GITHUB_ENTERPRISE",
  "GITLAB_CLOUD",
  "GITLAB_SELF_MANAGED",
];
export const scmGitReferenceKinds: readonly string[] = ["BRANCH", "TAG"];
const buildRunSortValues: readonly string[] = ["number", "-number"];

const appleDocs = "https://developer.apple.com/documentation/appstoreconnectapi";

const gitReferencePatterns = s.looseObject(
  `Branch or tag names the condition applies to. See ${appleDocs}/cibranchpatterns`,
  {
    isAllMatch: s.boolean("Match every branch or tag when true. When false, only the listed patterns match."),
    patterns: s.array(
      "Name patterns that match when isAllMatch is false.",
      s.looseObject("One branch or tag name pattern.", {
        pattern: s.string("Branch or tag name, or a name prefix when isPrefix is true."),
        isPrefix: s.boolean("Treat the pattern as a prefix instead of an exact name."),
      }),
    ),
  },
);

const filesAndFoldersRule = s.looseObject(
  `Files and folders rule that narrows which changes start a build. See ${appleDocs}/cifilesandfoldersrule`,
  {
    mode: s.stringEnum("Whether matching files start a build or prevent one.", [...ciFilesAndFoldersRuleModes]),
    matchers: s.array(
      "Files and folders the rule matches.",
      s.looseObject("One matcher; set any combination of directory, fileExtension, and fileName.", {
        directory: s.string("Directory path relative to the repository root."),
        fileExtension: s.string("File extension without the leading dot."),
        fileName: s.string("Exact file name."),
      }),
    ),
  },
);

const autoCancelInput = s.boolean(
  "Cancel builds that are still running for the same source when a newer change arrives.",
);

const branchStartCondition = s.looseObject(
  `Start a build when a matching branch changes. See ${appleDocs}/cibranchstartcondition`,
  { source: gitReferencePatterns, filesAndFoldersRule, autoCancel: autoCancelInput },
);
const tagStartCondition = s.looseObject(
  `Start a build when a matching tag is created. See ${appleDocs}/citagstartcondition`,
  { source: gitReferencePatterns, filesAndFoldersRule, autoCancel: autoCancelInput },
);
const pullRequestStartCondition = s.looseObject(
  `Start a build when a matching pull request is opened or updated. See ${appleDocs}/cipullrequeststartcondition`,
  {
    source: gitReferencePatterns,
    destination: gitReferencePatterns,
    filesAndFoldersRule,
    autoCancel: autoCancelInput,
  },
);
const scheduledStartCondition = s.looseObject(
  `Start builds on a schedule. See ${appleDocs}/cischeduledstartcondition`,
  {
    source: gitReferencePatterns,
    schedule: s.looseObject("When the schedule fires.", {
      frequency: s.stringEnum("How often the build starts.", [...ciScheduleFrequencies]),
      days: s.array("Days of the week for a WEEKLY schedule.", s.stringEnum("A day of the week.", [...ciScheduleDays])),
      hour: s.integer("Hour of the day the build starts."),
      minute: s.integer("Minute of the hour the build starts."),
      timezone: s.string("IANA time zone name, such as America/Los_Angeles."),
    }),
  },
);
const manualBranchStartCondition = s.looseObject(
  `Branches a build may be started from manually. See ${appleDocs}/cimanualbranchstartcondition`,
  { source: gitReferencePatterns },
);
const manualTagStartCondition = s.looseObject(
  `Tags a build may be started from manually. See ${appleDocs}/cimanualtagstartcondition`,
  { source: gitReferencePatterns },
);
const manualPullRequestStartCondition = s.looseObject(
  `Pull requests a build may be started from manually. See ${appleDocs}/cimanualpullrequeststartcondition`,
  { source: gitReferencePatterns, destination: gitReferencePatterns },
);

const testDestination = s.looseObject("One simulator or Mac destination.", {
  deviceTypeName: s.string("Device type name, such as iPhone 15."),
  deviceTypeIdentifier: s.string("Device type identifier."),
  runtimeName: s.string("Runtime name, such as iOS 17.4."),
  runtimeIdentifier: s.string("Runtime identifier."),
  kind: s.stringEnum("Whether the destination is a simulator or a Mac.", [...ciTestDestinationKinds]),
});

const ciAction = s.looseObject(`One action the workflow runs. See ${appleDocs}/ciaction`, {
  name: s.string("Action name shown in Xcode Cloud."),
  actionType: s.stringEnum("What the action does.", [...ciActionTypes]),
  destination: s.stringEnum("Device or simulator family the action targets.", [...ciActionDestinations]),
  buildDistributionAudience: s.stringEnum("Who may install the build an ARCHIVE action produces.", [
    ...buildAudienceTypes,
  ]),
  testConfiguration: s.looseObject("Test plan configuration for a TEST action.", {
    kind: s.stringEnum("Use the scheme test settings or a specific test plan.", [...ciTestConfigurationKinds]),
    testPlanName: s.string("Name of the test plan to run when kind is SPECIFIC_TEST_PLANS."),
    testDestinations: s.array("Simulators and Macs the tests run on.", testDestination),
  }),
  scheme: s.string("Xcode scheme the action builds."),
  platform: s.stringEnum("Platform the action builds for.", [...ciActionPlatforms]),
  isRequiredToPass: s.boolean("Whether the whole build run fails when this action fails."),
});

const workflowActionsInput = s.array("Actions the workflow runs, in order.", ciAction, {
  minItems: 1,
});

const workflowAttributeInputs = {
  name: nonEmptyString("Workflow name shown in App Store Connect and Xcode."),
  description: s.string("Description shown under the workflow name."),
  branchStartCondition,
  tagStartCondition,
  pullRequestStartCondition,
  scheduledStartCondition,
  manualBranchStartCondition,
  manualTagStartCondition,
  manualPullRequestStartCondition,
  actions: workflowActionsInput,
  isEnabled: s.boolean("Enable the workflow so its start conditions can start builds."),
  isLockedForEditing: s.boolean("Lock the workflow so it cannot be edited in Xcode."),
  clean: s.boolean("Start every build from a clean environment without cached derived data."),
  containerFilePath: nonEmptyString(
    "Path of the Xcode project, workspace, or Swift package the workflow builds, relative to the repository root.",
  ),
};

const commitSummary = s.looseObject("A commit Xcode Cloud built.", {
  commitSha: s.string("Full commit SHA."),
  message: s.string("Commit message."),
  author: s.looseObject("Who authored the commit.", {
    displayName: s.string("Display name of the author."),
    avatarUrl: s.string("Avatar image URL of the author."),
  }),
  committer: s.looseObject("Who committed the change.", {
    displayName: s.string("Display name of the committer."),
    avatarUrl: s.string("Avatar image URL of the committer."),
  }),
  webUrl: s.string("URL of the commit on the source control provider."),
});

const issueCounts = s.looseObject("Number of issues by type.", {
  analyzerWarnings: s.integer("Number of analyzer warnings."),
  errors: s.integer("Number of errors."),
  testFailures: s.integer("Number of test failures."),
  warnings: s.integer("Number of warnings."),
});

const fileLocation = s.looseObject("Source file the record points at.", {
  path: s.string("File path relative to the repository root."),
  lineNumber: s.integer("Line number in the file."),
});

export const ciProductResource: JsonSchema = resourceObject(
  "An Xcode Cloud product, the container that holds the workflows of one app or framework.",
  "App Store Connect identifier for the Xcode Cloud product.",
  {
    name: s.nullableString("Product name."),
    createdDate: s.nullableString("When the product was created, as an ISO 8601 timestamp."),
    productType: nullableEnum("Whether the product builds an app or a framework.", ciProductTypes),
    appId: s.nullableString("Identifier of the app the product belongs to."),
  },
  ["appId"],
);

export const ciWorkflowResource: JsonSchema = resourceObject(
  "An Xcode Cloud workflow.",
  "App Store Connect identifier for the workflow.",
  {
    name: s.nullableString("Workflow name shown in App Store Connect and Xcode."),
    description: s.nullableString("Description shown under the workflow name."),
    branchStartCondition: s.nullable(branchStartCondition),
    tagStartCondition: s.nullable(tagStartCondition),
    pullRequestStartCondition: s.nullable(pullRequestStartCondition),
    scheduledStartCondition: s.nullable(scheduledStartCondition),
    manualBranchStartCondition: s.nullable(manualBranchStartCondition),
    manualTagStartCondition: s.nullable(manualTagStartCondition),
    manualPullRequestStartCondition: s.nullable(manualPullRequestStartCondition),
    actions: s.nullable(s.array("Actions the workflow runs, in order.", ciAction)),
    isEnabled: s.nullableBoolean("Whether the workflow is enabled and can start builds."),
    isLockedForEditing: s.nullableBoolean("Whether the workflow is locked against editing in Xcode."),
    clean: s.nullableBoolean("Whether every build starts from a clean environment without cached derived data."),
    containerFilePath: s.nullableString(
      "Path of the Xcode project, workspace, or Swift package the workflow builds, relative to the repository root.",
    ),
    lastModifiedDate: s.nullableString("When the workflow was last changed, as an ISO 8601 timestamp."),
    ciProductId: s.nullableString("Identifier of the Xcode Cloud product the workflow belongs to."),
    scmRepositoryId: s.nullableString("Identifier of the repository the workflow builds from."),
    ciXcodeVersionId: s.nullableString("Identifier of the Xcode version the workflow builds with."),
    ciMacOsVersionId: s.nullableString("Identifier of the macOS version the workflow builds on."),
  },
  ["ciProductId", "scmRepositoryId", "ciXcodeVersionId", "ciMacOsVersionId"],
);

export const ciBuildRunResource: JsonSchema = resourceObject(
  "One run of an Xcode Cloud workflow.",
  "App Store Connect identifier for the build run.",
  {
    number: s.nullableInteger("Sequential build number within the product."),
    createdDate: s.nullableString("When the run was created, as an ISO 8601 timestamp."),
    startedDate: s.nullableString("When the run started, as an ISO 8601 timestamp."),
    finishedDate: s.nullableString("When the run finished, as an ISO 8601 timestamp."),
    sourceCommit: s.nullable(commitSummary),
    destinationCommit: s.nullable(commitSummary),
    isPullRequestBuild: s.nullableBoolean("Whether the run was started for a pull request."),
    issueCounts: s.nullable(issueCounts),
    executionProgress: nullableEnum("Whether the run is pending, running, or complete.", [...ciExecutionProgresses]),
    completionStatus: nullableEnum("Outcome of the run once it is complete.", [...ciCompletionStatuses]),
    startReason: nullableEnum("What started the run.", ciStartReasons),
    cancelReason: nullableEnum("Why the run was canceled, when it was.", ciCancelReasons),
    ciWorkflowId: s.nullableString("Identifier of the workflow that ran."),
    ciProductId: s.nullableString("Identifier of the Xcode Cloud product the run belongs to."),
    sourceBranchOrTagId: s.nullableString("Identifier of the Git reference (branch or tag) the run built."),
    destinationBranchId: s.nullableString("Identifier of the destination branch for a pull request run."),
    scmPullRequestId: s.nullableString("Identifier of the pull request the run was started for."),
  },
  ["ciWorkflowId", "ciProductId", "sourceBranchOrTagId", "destinationBranchId", "scmPullRequestId"],
);

export const ciBuildActionResource: JsonSchema = resourceObject(
  "One action (build, analyze, test, or archive) inside a build run.",
  "App Store Connect identifier for the build action.",
  {
    name: s.nullableString("Action name shown in Xcode Cloud."),
    actionType: nullableEnum("What the action does.", ciActionTypes),
    startedDate: s.nullableString("When the action started, as an ISO 8601 timestamp."),
    finishedDate: s.nullableString("When the action finished, as an ISO 8601 timestamp."),
    issueCounts: s.nullable(issueCounts),
    executionProgress: nullableEnum("Whether the action is pending, running, or complete.", [...ciExecutionProgresses]),
    completionStatus: nullableEnum("Outcome of the action once it is complete.", [...ciCompletionStatuses]),
    isRequiredToPass: s.nullableBoolean("Whether the whole build run fails when this action fails."),
    ciBuildRunId: s.nullableString("Identifier of the build run the action belongs to."),
  },
  ["ciBuildRunId"],
);

export const ciArtifactResource: JsonSchema = resourceObject(
  "A file produced by a build action, such as an archive or a log bundle.",
  "App Store Connect identifier for the artifact.",
  {
    fileType: nullableEnum("Kind of artifact.", ciArtifactFileTypes),
    fileName: s.nullableString("File name of the artifact."),
    fileSize: s.nullableInteger("File size in bytes."),
    downloadUrl: s.nullableString("Time-limited URL to download the artifact from."),
  },
);

export const ciIssueResource: JsonSchema = resourceObject(
  "An error, warning, analyzer warning, or test failure reported by a build action.",
  "App Store Connect identifier for the issue.",
  {
    issueType: nullableEnum("Kind of issue.", ciIssueTypes),
    message: s.nullableString("Issue message."),
    fileSource: s.nullable(fileLocation),
    category: s.nullableString("Issue category, such as Swift Compiler Error."),
  },
);

export const ciTestResultResource: JsonSchema = resourceObject(
  "The result of one test method across the destinations it ran on.",
  "App Store Connect identifier for the test result.",
  {
    className: s.nullableString("Name of the test class."),
    name: s.nullableString("Name of the test method."),
    status: nullableEnum("Overall test status across all destinations.", ciTestStatuses),
    fileSource: s.nullable(fileLocation),
    message: s.nullableString("Failure message, when the test did not succeed."),
    destinationTestResults: s.nullable(
      s.array(
        "Per-destination results.",
        s.looseObject("Result on one simulator or device.", {
          uuid: s.string("Identifier of the destination."),
          deviceName: s.string("Device name, such as iPhone 15."),
          osVersion: s.string("Operating system version on the destination."),
          status: s.stringEnum("Test status on this destination.", [...ciTestStatuses]),
          duration: s.number("Test duration in seconds."),
        }),
      ),
    ),
  },
);

export const ciMacOsVersionResource: JsonSchema = resourceObject(
  "A macOS version Xcode Cloud can build on.",
  "App Store Connect identifier for the macOS version.",
  {
    version: s.nullableString("macOS version number, such as 14.4."),
    name: s.nullableString("macOS version name, such as macOS Sonoma 14.4."),
  },
);

export const ciXcodeVersionResource: JsonSchema = resourceObject(
  "An Xcode version Xcode Cloud can build with.",
  "App Store Connect identifier for the Xcode version.",
  {
    version: s.nullableString("Xcode version number, such as 15.3."),
    name: s.nullableString("Xcode version name, such as Xcode 15.3."),
    testDestinations: s.nullable(
      s.array(
        "Simulators and Macs available for tests with this Xcode version.",
        s.looseObject("One device type and the runtimes it offers.", {
          deviceTypeName: s.string("Device type name, such as iPhone 15."),
          deviceTypeIdentifier: s.string("Device type identifier."),
          availableRuntimes: s.array(
            "Runtimes available for the device type.",
            s.looseObject("One runtime.", {
              runtimeName: s.string("Runtime name, such as iOS 17.4."),
              runtimeIdentifier: s.string("Runtime identifier."),
            }),
          ),
          kind: s.stringEnum("Whether the destination is a simulator or a Mac.", [...ciTestDestinationKinds]),
        }),
      ),
    ),
  },
);

export const scmProviderResource: JsonSchema = resourceObject(
  "A source control provider connected to Xcode Cloud.",
  "App Store Connect identifier for the source control provider.",
  {
    scmProviderType: s.nullable(
      s.looseObject("Kind of source control provider.", {
        kind: s.stringEnum("Provider product.", [...scmProviderKinds]),
        displayName: s.string("Display name of the provider."),
        isOnPremise: s.boolean("Whether the provider is self-hosted."),
      }),
    ),
    url: s.nullableString("Base URL of the provider."),
  },
);

export const scmRepositoryResource: JsonSchema = resourceObject(
  "A source repository Xcode Cloud can build.",
  "App Store Connect identifier for the repository.",
  {
    lastAccessedDate: s.nullableString("When Xcode Cloud last accessed the repository, as an ISO 8601 timestamp."),
    httpCloneUrl: s.nullableString("HTTPS clone URL."),
    sshCloneUrl: s.nullableString("SSH clone URL."),
    ownerName: s.nullableString("Owner or organization the repository belongs to."),
    repositoryName: s.nullableString("Repository name."),
    scmProviderId: s.nullableString("Identifier of the source control provider."),
    defaultBranchId: s.nullableString("Identifier of the Git reference for the default branch."),
  },
  ["scmProviderId", "defaultBranchId"],
);

export const scmGitReferenceResource: JsonSchema = resourceObject(
  "A branch or tag in a source repository.",
  "App Store Connect identifier for the Git reference.",
  {
    name: s.nullableString("Short name, such as main or v1.2.0."),
    canonicalName: s.nullableString("Full reference name, such as refs/heads/main."),
    isDeleted: s.nullableBoolean("Whether the reference has been deleted from the repository."),
    kind: nullableEnum("Whether the reference is a branch or a tag.", scmGitReferenceKinds),
    scmRepositoryId: s.nullableString("Identifier of the repository the reference belongs to."),
  },
  ["scmRepositoryId"],
);

export const scmPullRequestResource: JsonSchema = resourceObject(
  "A pull request in a source repository.",
  "App Store Connect identifier for the pull request.",
  {
    title: s.nullableString("Pull request title."),
    number: s.nullableInteger("Pull request number on the source control provider."),
    webUrl: s.nullableString("URL of the pull request on the source control provider."),
    sourceRepositoryOwner: s.nullableString("Owner of the repository the changes come from."),
    sourceRepositoryName: s.nullableString("Name of the repository the changes come from."),
    sourceBranchName: s.nullableString("Branch the changes come from."),
    destinationRepositoryOwner: s.nullableString("Owner of the repository the changes go to."),
    destinationRepositoryName: s.nullableString("Name of the repository the changes go to."),
    destinationBranchName: s.nullableString("Branch the changes go to."),
    isClosed: s.nullableBoolean("Whether the pull request is closed."),
    isCrossRepository: s.nullableBoolean("Whether the source and destination repositories differ."),
    scmRepositoryId: s.nullableString("Identifier of the repository the pull request belongs to."),
  },
  ["scmRepositoryId"],
);

const ciProductIdInput = nonEmptyString("App Store Connect identifier of the Xcode Cloud product.");
const ciWorkflowIdInput = nonEmptyString("App Store Connect identifier of the workflow.");
const ciBuildRunIdInput = nonEmptyString("App Store Connect identifier of the build run.");
const ciBuildActionIdInput = nonEmptyString("App Store Connect identifier of the build action.");
const scmRepositoryIdInput = nonEmptyString("App Store Connect identifier of the repository.");
const buildRunSortInput = s.stringEnum("Sort order for the returned build runs.", [...buildRunSortValues]);
const buildRunBuildFilterInput = nonEmptyString("Return only build runs that produced this App Store Connect build.");

const paginationOnlyInput = (description: string) => s.object(description, { ...paginationInputs }, { required: [] });

const scopedListInput = (description: string, idField: string, idSchema: ReturnType<typeof nonEmptyString>) =>
  s.object(description, { [idField]: idSchema, ...paginationInputs }, { required: [idField] });

export const appStoreConnectXcodeCloudActions: readonly ProviderActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_ci_products",
    operationType: "read",
    description:
      "List the Xcode Cloud products of the team, optionally narrowed to one app or to app or framework products. A product holds the workflows and build runs of one app or framework.",
    requiredScopes: [],
    inputSchema: s.object(
      "Filters for browsing Xcode Cloud products.",
      {
        appId: nonEmptyString("Return only the product of this app."),
        productType: s.stringEnum("Return only products of this type.", [...ciProductTypes]),
        ...paginationInputs,
      },
      { required: [] },
    ),
    outputSchema: pageOutput(
      "ciProducts",
      ciProductResource,
      "Xcode Cloud products returned for this page.",
      "A page of Xcode Cloud products.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_ci_product",
    operationType: "read",
    description: "Read one Xcode Cloud product by its App Store Connect identifier.",
    requiredScopes: [],
    inputSchema: s.actionInput(
      { ciProductId: ciProductIdInput },
      ["ciProductId"],
      "Identifies the Xcode Cloud product to read.",
    ),
    outputSchema: s.actionOutput({ ciProduct: ciProductResource }, "The requested Xcode Cloud product."),
  }),
  defineProviderAction(service, {
    name: "delete_ci_product",
    operationType: "destructive",
    description:
      "Delete an Xcode Cloud product, which removes every workflow and build history of that app or framework from Xcode Cloud.",
    requiredScopes: [],
    providerPermissions: [...manageXcodeCloudRoles],
    inputSchema: s.actionInput(
      { ciProductId: ciProductIdInput },
      ["ciProductId"],
      "Identifies the Xcode Cloud product to delete.",
    ),
    outputSchema: s.actionOutput(
      deletedOutput("App Store Connect identifier of the deleted Xcode Cloud product."),
      "Confirmation that the Xcode Cloud product was deleted.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_ci_product_workflows",
    operationType: "read",
    description: "List the workflows of one Xcode Cloud product.",
    requiredScopes: [],
    inputSchema: scopedListInput(
      "Identifies the Xcode Cloud product whose workflows to list.",
      "ciProductId",
      ciProductIdInput,
    ),
    outputSchema: pageOutput(
      "ciWorkflows",
      ciWorkflowResource,
      "Workflows returned for this page.",
      "A page of Xcode Cloud workflows.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_ci_product_build_runs",
    operationType: "read",
    description:
      "List the build runs of one Xcode Cloud product across all of its workflows, optionally narrowed to the run that produced one build.",
    requiredScopes: [],
    inputSchema: s.object(
      "Filters for browsing the build runs of one Xcode Cloud product.",
      {
        ciProductId: ciProductIdInput,
        buildId: buildRunBuildFilterInput,
        sort: buildRunSortInput,
        ...paginationInputs,
      },
      { required: ["ciProductId"] },
    ),
    outputSchema: pageOutput(
      "ciBuildRuns",
      ciBuildRunResource,
      "Build runs returned for this page.",
      "A page of Xcode Cloud build runs.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_ci_product_primary_repositories",
    operationType: "read",
    description:
      "List the primary repositories of one Xcode Cloud product, the repositories that hold the project or package its workflows build.",
    requiredScopes: [],
    inputSchema: scopedListInput(
      "Identifies the Xcode Cloud product whose primary repositories to list.",
      "ciProductId",
      ciProductIdInput,
    ),
    outputSchema: pageOutput(
      "scmRepositories",
      scmRepositoryResource,
      "Repositories returned for this page.",
      "A page of source repositories.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_ci_product_additional_repositories",
    operationType: "read",
    description:
      "List the additional repositories of one Xcode Cloud product, such as Swift package dependencies Xcode Cloud has been granted access to.",
    requiredScopes: [],
    inputSchema: scopedListInput(
      "Identifies the Xcode Cloud product whose additional repositories to list.",
      "ciProductId",
      ciProductIdInput,
    ),
    outputSchema: pageOutput(
      "scmRepositories",
      scmRepositoryResource,
      "Repositories returned for this page.",
      "A page of source repositories.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_ci_workflow",
    operationType: "read",
    description:
      "Read one Xcode Cloud workflow with its start conditions, actions, and the product, repository, Xcode version, and macOS version it uses.",
    requiredScopes: [],
    inputSchema: s.actionInput(
      { ciWorkflowId: ciWorkflowIdInput },
      ["ciWorkflowId"],
      "Identifies the workflow to read.",
    ),
    outputSchema: s.actionOutput({ ciWorkflow: ciWorkflowResource }, "The requested workflow."),
  }),
  defineProviderAction(service, {
    name: "create_ci_workflow",
    operationType: "write",
    description:
      "Create an Xcode Cloud workflow for a product. Give it at least one action and, for automatic builds, one or more start conditions; without start conditions it can only be started manually.",
    requiredScopes: [],
    providerPermissions: [...manageXcodeCloudRoles],
    inputSchema: s.object(
      "The workflow to create.",
      {
        ciProductId: nonEmptyString("App Store Connect identifier of the Xcode Cloud product the workflow belongs to."),
        scmRepositoryId: nonEmptyString("App Store Connect identifier of the repository the workflow builds from."),
        ciXcodeVersionId: nonEmptyString(
          "App Store Connect identifier of the Xcode version to build with. Use list_ci_xcode_versions to find one.",
        ),
        ciMacOsVersionId: nonEmptyString(
          "App Store Connect identifier of the macOS version to build on. Use list_ci_mac_os_versions to find one compatible with the Xcode version.",
        ),
        ...workflowAttributeInputs,
      },
      {
        required: [
          "ciProductId",
          "scmRepositoryId",
          "ciXcodeVersionId",
          "ciMacOsVersionId",
          "name",
          "description",
          "actions",
          "isEnabled",
          "clean",
          "containerFilePath",
        ],
      },
    ),
    outputSchema: s.actionOutput({ ciWorkflow: ciWorkflowResource }, "The created workflow."),
  }),
  defineProviderAction(service, {
    name: "update_ci_workflow",
    operationType: "destructive",
    description:
      "Change an Xcode Cloud workflow. Every field given replaces the current value; a start condition or the actions array is replaced as a whole, so pass the complete new object. Give at least one field to change.",
    requiredScopes: [],
    providerPermissions: [...manageXcodeCloudRoles],
    inputSchema: s.object(
      "The workflow fields to change.",
      {
        ciWorkflowId: ciWorkflowIdInput,
        ...workflowAttributeInputs,
        ciXcodeVersionId: nonEmptyString(
          "App Store Connect identifier of the Xcode version to switch the workflow to.",
        ),
        ciMacOsVersionId: nonEmptyString(
          "App Store Connect identifier of the macOS version to switch the workflow to.",
        ),
      },
      { required: ["ciWorkflowId"] },
    ),
    outputSchema: s.actionOutput({ ciWorkflow: ciWorkflowResource }, "The updated workflow."),
  }),
  defineProviderAction(service, {
    name: "delete_ci_workflow",
    operationType: "destructive",
    description:
      "Delete an Xcode Cloud workflow together with its build history. Builds already delivered to TestFlight or App Store Connect are kept.",
    requiredScopes: [],
    providerPermissions: [...manageXcodeCloudRoles],
    inputSchema: s.actionInput(
      { ciWorkflowId: ciWorkflowIdInput },
      ["ciWorkflowId"],
      "Identifies the workflow to delete.",
    ),
    outputSchema: s.actionOutput(
      deletedOutput("App Store Connect identifier of the deleted workflow."),
      "Confirmation that the workflow was deleted.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_ci_workflow_build_runs",
    operationType: "read",
    description:
      "List the build runs of one Xcode Cloud workflow, optionally narrowed to the run that produced one build.",
    requiredScopes: [],
    inputSchema: s.object(
      "Filters for browsing the build runs of one workflow.",
      {
        ciWorkflowId: ciWorkflowIdInput,
        buildId: buildRunBuildFilterInput,
        sort: buildRunSortInput,
        ...paginationInputs,
      },
      { required: ["ciWorkflowId"] },
    ),
    outputSchema: pageOutput(
      "ciBuildRuns",
      ciBuildRunResource,
      "Build runs returned for this page.",
      "A page of Xcode Cloud build runs.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_ci_workflow_repository",
    operationType: "read",
    description: "Read the source repository an Xcode Cloud workflow builds from.",
    requiredScopes: [],
    inputSchema: s.actionInput(
      { ciWorkflowId: ciWorkflowIdInput },
      ["ciWorkflowId"],
      "Identifies the workflow whose repository to read.",
    ),
    outputSchema: s.actionOutput({ scmRepository: scmRepositoryResource }, "The repository the workflow builds from."),
  }),
  defineProviderAction(service, {
    name: "get_ci_build_run",
    operationType: "read",
    description:
      "Read one Xcode Cloud build run, including its progress, completion status, issue counts, and the commit it built. Poll it to follow a run started with start_ci_build_run.",
    requiredScopes: [],
    inputSchema: s.actionInput(
      { ciBuildRunId: ciBuildRunIdInput },
      ["ciBuildRunId"],
      "Identifies the build run to read.",
    ),
    outputSchema: s.actionOutput({ ciBuildRun: ciBuildRunResource }, "The requested build run."),
  }),
  defineProviderAction(service, {
    name: "start_ci_build_run",
    operationType: "write",
    description:
      "Start an Xcode Cloud build run for a workflow. Pass the Git reference of the branch or tag to build, or the pull request to build; the run is queued and progresses asynchronously, so read it back with get_ci_build_run.",
    requiredScopes: [],
    providerPermissions: [...manageXcodeCloudRoles],
    inputSchema: s.object(
      "The build run to start.",
      {
        ciWorkflowId: nonEmptyString("App Store Connect identifier of the workflow to run."),
        sourceBranchOrTagId: nonEmptyString(
          "App Store Connect identifier of the Git reference (branch or tag) to build. Use list_scm_repository_git_references to find one.",
        ),
        scmPullRequestId: nonEmptyString(
          "App Store Connect identifier of the pull request to build. Use list_scm_repository_pull_requests to find one.",
        ),
        clean: s.boolean("Start this run from a clean environment without cached derived data."),
      },
      { required: ["ciWorkflowId"] },
    ),
    outputSchema: s.actionOutput({ ciBuildRun: ciBuildRunResource }, "The queued build run."),
  }),
  defineProviderAction(service, {
    name: "list_ci_build_run_actions",
    operationType: "read",
    description:
      "List the actions (build, analyze, test, archive) of one build run with the progress and outcome of each.",
    requiredScopes: [],
    inputSchema: scopedListInput("Identifies the build run whose actions to list.", "ciBuildRunId", ciBuildRunIdInput),
    outputSchema: pageOutput(
      "ciBuildActions",
      ciBuildActionResource,
      "Build actions returned for this page.",
      "A page of Xcode Cloud build actions.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_ci_build_run_builds",
    operationType: "read",
    description:
      "List the App Store Connect builds an Xcode Cloud build run delivered, with the prerelease version each build belongs to. Use it to find the build to distribute after an archive action.",
    requiredScopes: [],
    inputSchema: s.object(
      "Filters for browsing the builds of one build run.",
      {
        ciBuildRunId: ciBuildRunIdInput,
        version: nonEmptyString("Return only builds with this build number, such as 42."),
        preReleaseVersion: nonEmptyString("Return only builds under this marketing version, such as 1.4.0."),
        platform: s.stringEnum("Return only builds for this content platform.", contentPlatforms),
        processingState: s.stringEnum("Return only builds in this processing state.", buildProcessingStates),
        betaReviewState: s.stringEnum(
          "Return only builds whose beta review submission is in this state.",
          betaReviewStates,
        ),
        expired: s.boolean("Return only expired builds when true, or only unexpired builds when false."),
        sort: s.stringEnum("Sort order for the returned builds.", [
          "version",
          "-version",
          "uploadedDate",
          "-uploadedDate",
          "preReleaseVersion",
          "-preReleaseVersion",
        ]),
        ...paginationInputs,
      },
      { required: ["ciBuildRunId"] },
    ),
    outputSchema: pageOutput(
      "builds",
      buildResource,
      "Builds returned for this page.",
      "A page of builds delivered by one build run.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_ci_build_action",
    operationType: "read",
    description: "Read one action of a build run, with its progress, outcome, and issue counts.",
    requiredScopes: [],
    inputSchema: s.actionInput(
      { ciBuildActionId: ciBuildActionIdInput },
      ["ciBuildActionId"],
      "Identifies the build action to read.",
    ),
    outputSchema: s.actionOutput({ ciBuildAction: ciBuildActionResource }, "The requested build action."),
  }),
  defineProviderAction(service, {
    name: "list_ci_build_action_artifacts",
    operationType: "read",
    description:
      "List the artifacts a build action produced, such as archives, log bundles, and result bundles, each with a time-limited download URL.",
    requiredScopes: [],
    inputSchema: scopedListInput(
      "Identifies the build action whose artifacts to list.",
      "ciBuildActionId",
      ciBuildActionIdInput,
    ),
    outputSchema: pageOutput(
      "ciArtifacts",
      ciArtifactResource,
      "Artifacts returned for this page.",
      "A page of build artifacts.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_ci_build_action_issues",
    operationType: "read",
    description: "List the errors, warnings, analyzer warnings, and test failures a build action reported.",
    requiredScopes: [],
    inputSchema: scopedListInput(
      "Identifies the build action whose issues to list.",
      "ciBuildActionId",
      ciBuildActionIdInput,
    ),
    outputSchema: pageOutput("ciIssues", ciIssueResource, "Issues returned for this page.", "A page of build issues."),
  }),
  defineProviderAction(service, {
    name: "list_ci_build_action_test_results",
    operationType: "read",
    description: "List the per-test results of a test action, with the outcome on each destination.",
    requiredScopes: [],
    inputSchema: scopedListInput(
      "Identifies the test action whose results to list.",
      "ciBuildActionId",
      ciBuildActionIdInput,
    ),
    outputSchema: pageOutput(
      "ciTestResults",
      ciTestResultResource,
      "Test results returned for this page.",
      "A page of test results.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_ci_build_action_build_run",
    operationType: "read",
    description: "Read the build run a build action belongs to.",
    requiredScopes: [],
    inputSchema: s.actionInput(
      { ciBuildActionId: ciBuildActionIdInput },
      ["ciBuildActionId"],
      "Identifies the build action whose build run to read.",
    ),
    outputSchema: s.actionOutput({ ciBuildRun: ciBuildRunResource }, "The build run the action belongs to."),
  }),
  defineProviderAction(service, {
    name: "get_ci_artifact",
    operationType: "read",
    description: "Read one build artifact, including a fresh time-limited download URL for its file.",
    requiredScopes: [],
    inputSchema: s.actionInput(
      { ciArtifactId: nonEmptyString("App Store Connect identifier of the artifact.") },
      ["ciArtifactId"],
      "Identifies the artifact to read.",
    ),
    outputSchema: s.actionOutput({ ciArtifact: ciArtifactResource }, "The requested artifact."),
  }),
  defineProviderAction(service, {
    name: "get_ci_issue",
    operationType: "read",
    description: "Read one issue a build action reported, with the file and line it points at.",
    requiredScopes: [],
    inputSchema: s.actionInput(
      { ciIssueId: nonEmptyString("App Store Connect identifier of the issue.") },
      ["ciIssueId"],
      "Identifies the issue to read.",
    ),
    outputSchema: s.actionOutput({ ciIssue: ciIssueResource }, "The requested issue."),
  }),
  defineProviderAction(service, {
    name: "get_ci_test_result",
    operationType: "read",
    description: "Read the result of one test method across the destinations it ran on.",
    requiredScopes: [],
    inputSchema: s.actionInput(
      { ciTestResultId: nonEmptyString("App Store Connect identifier of the test result.") },
      ["ciTestResultId"],
      "Identifies the test result to read.",
    ),
    outputSchema: s.actionOutput({ ciTestResult: ciTestResultResource }, "The requested test result."),
  }),
  defineProviderAction(service, {
    name: "list_ci_mac_os_versions",
    operationType: "read",
    description: "List the macOS versions Xcode Cloud can build on.",
    requiredScopes: [],
    inputSchema: paginationOnlyInput("Pagination for browsing macOS versions."),
    outputSchema: pageOutput(
      "ciMacOsVersions",
      ciMacOsVersionResource,
      "macOS versions returned for this page.",
      "A page of macOS versions available in Xcode Cloud.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_ci_mac_os_version",
    operationType: "read",
    description: "Read one macOS version available in Xcode Cloud.",
    requiredScopes: [],
    inputSchema: s.actionInput(
      { ciMacOsVersionId: nonEmptyString("App Store Connect identifier of the macOS version.") },
      ["ciMacOsVersionId"],
      "Identifies the macOS version to read.",
    ),
    outputSchema: s.actionOutput({ ciMacOsVersion: ciMacOsVersionResource }, "The requested macOS version."),
  }),
  defineProviderAction(service, {
    name: "list_ci_mac_os_version_xcode_versions",
    operationType: "read",
    description: "List the Xcode versions that can run on one macOS version in Xcode Cloud.",
    requiredScopes: [],
    inputSchema: scopedListInput(
      "Identifies the macOS version whose Xcode versions to list.",
      "ciMacOsVersionId",
      nonEmptyString("App Store Connect identifier of the macOS version."),
    ),
    outputSchema: pageOutput(
      "ciXcodeVersions",
      ciXcodeVersionResource,
      "Xcode versions returned for this page.",
      "A page of Xcode versions available in Xcode Cloud.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_ci_xcode_versions",
    operationType: "read",
    description:
      "List the Xcode versions Xcode Cloud can build with, each with the simulators and Macs available for tests.",
    requiredScopes: [],
    inputSchema: paginationOnlyInput("Pagination for browsing Xcode versions."),
    outputSchema: pageOutput(
      "ciXcodeVersions",
      ciXcodeVersionResource,
      "Xcode versions returned for this page.",
      "A page of Xcode versions available in Xcode Cloud.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_ci_xcode_version",
    operationType: "read",
    description: "Read one Xcode version available in Xcode Cloud, with the simulators and Macs available for tests.",
    requiredScopes: [],
    inputSchema: s.actionInput(
      { ciXcodeVersionId: nonEmptyString("App Store Connect identifier of the Xcode version.") },
      ["ciXcodeVersionId"],
      "Identifies the Xcode version to read.",
    ),
    outputSchema: s.actionOutput({ ciXcodeVersion: ciXcodeVersionResource }, "The requested Xcode version."),
  }),
  defineProviderAction(service, {
    name: "list_ci_xcode_version_mac_os_versions",
    operationType: "read",
    description: "List the macOS versions one Xcode version can run on in Xcode Cloud.",
    requiredScopes: [],
    inputSchema: scopedListInput(
      "Identifies the Xcode version whose macOS versions to list.",
      "ciXcodeVersionId",
      nonEmptyString("App Store Connect identifier of the Xcode version."),
    ),
    outputSchema: pageOutput(
      "ciMacOsVersions",
      ciMacOsVersionResource,
      "macOS versions returned for this page.",
      "A page of macOS versions available in Xcode Cloud.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_scm_providers",
    operationType: "read",
    description: "List the source control providers (GitHub, GitLab, Bitbucket) connected to Xcode Cloud for the team.",
    requiredScopes: [],
    inputSchema: paginationOnlyInput("Pagination for browsing source control providers."),
    outputSchema: pageOutput(
      "scmProviders",
      scmProviderResource,
      "Source control providers returned for this page.",
      "A page of source control providers.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_scm_provider",
    operationType: "read",
    description: "Read one source control provider connected to Xcode Cloud.",
    requiredScopes: [],
    inputSchema: s.actionInput(
      {
        scmProviderId: nonEmptyString("App Store Connect identifier of the source control provider."),
      },
      ["scmProviderId"],
      "Identifies the source control provider to read.",
    ),
    outputSchema: s.actionOutput({ scmProvider: scmProviderResource }, "The requested source control provider."),
  }),
  defineProviderAction(service, {
    name: "list_scm_provider_repositories",
    operationType: "read",
    description: "List the repositories Xcode Cloud can access on one source control provider.",
    requiredScopes: [],
    inputSchema: scopedListInput(
      "Identifies the source control provider whose repositories to list.",
      "scmProviderId",
      nonEmptyString("App Store Connect identifier of the source control provider."),
    ),
    outputSchema: pageOutput(
      "scmRepositories",
      scmRepositoryResource,
      "Repositories returned for this page.",
      "A page of source repositories.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_scm_repositories",
    operationType: "read",
    description:
      "List every source repository Xcode Cloud can access across all connected providers, optionally narrowed to specific repository identifiers.",
    requiredScopes: [],
    inputSchema: s.object(
      "Filters for browsing source repositories.",
      {
        scmRepositoryIds: s.stringArray("Return only the repositories with these identifiers.", {
          minItems: 1,
          itemDescription: "App Store Connect identifier of a repository.",
        }),
        ...paginationInputs,
      },
      { required: [] },
    ),
    outputSchema: pageOutput(
      "scmRepositories",
      scmRepositoryResource,
      "Repositories returned for this page.",
      "A page of source repositories.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_scm_repository",
    operationType: "read",
    description: "Read one source repository, with its provider and default branch identifiers.",
    requiredScopes: [],
    inputSchema: s.actionInput(
      { scmRepositoryId: scmRepositoryIdInput },
      ["scmRepositoryId"],
      "Identifies the repository to read.",
    ),
    outputSchema: s.actionOutput({ scmRepository: scmRepositoryResource }, "The requested repository."),
  }),
  defineProviderAction(service, {
    name: "list_scm_repository_git_references",
    operationType: "read",
    description:
      "List the branches and tags of one repository as Xcode Cloud sees them. Their identifiers are what start_ci_build_run takes as sourceBranchOrTagId.",
    requiredScopes: [],
    inputSchema: scopedListInput(
      "Identifies the repository whose branches and tags to list.",
      "scmRepositoryId",
      scmRepositoryIdInput,
    ),
    outputSchema: pageOutput(
      "scmGitReferences",
      scmGitReferenceResource,
      "Branches and tags returned for this page.",
      "A page of Git references.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_scm_repository_pull_requests",
    operationType: "read",
    description:
      "List the pull requests of one repository as Xcode Cloud sees them. Their identifiers are what start_ci_build_run takes as scmPullRequestId.",
    requiredScopes: [],
    inputSchema: scopedListInput(
      "Identifies the repository whose pull requests to list.",
      "scmRepositoryId",
      scmRepositoryIdInput,
    ),
    outputSchema: pageOutput(
      "scmPullRequests",
      scmPullRequestResource,
      "Pull requests returned for this page.",
      "A page of pull requests.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_scm_git_reference",
    operationType: "read",
    description: "Read one branch or tag of a repository as Xcode Cloud sees it.",
    requiredScopes: [],
    inputSchema: s.actionInput(
      {
        scmGitReferenceId: nonEmptyString("App Store Connect identifier of the Git reference."),
      },
      ["scmGitReferenceId"],
      "Identifies the Git reference to read.",
    ),
    outputSchema: s.actionOutput({ scmGitReference: scmGitReferenceResource }, "The requested Git reference."),
  }),
  defineProviderAction(service, {
    name: "get_scm_pull_request",
    operationType: "read",
    description: "Read one pull request of a repository as Xcode Cloud sees it.",
    requiredScopes: [],
    inputSchema: s.actionInput(
      {
        scmPullRequestId: nonEmptyString("App Store Connect identifier of the pull request."),
      },
      ["scmPullRequestId"],
      "Identifies the pull request to read.",
    ),
    outputSchema: s.actionOutput({ scmPullRequest: scmPullRequestResource }, "The requested pull request."),
  }),
];
