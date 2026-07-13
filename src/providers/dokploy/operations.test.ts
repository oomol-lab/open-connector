import type { DokployActionName } from "./actions.ts";
import type { DokployOperation } from "./operations.ts";

import { describe, expect, expectTypeOf, it } from "vitest";
import { dokployActions } from "./actions.ts";
import { dokployOperationByActionName, dokployOperations } from "./operations.ts";
import { dokployActionHandlers } from "./runtime.ts";

// Fixed snapshot of the names exported by dokploy-mcp's generatedTools.
// Keep this independent from the OpenConnector generator so an accidental
// upstream coverage regression cannot make both sides of the assertion pass.
const expectedMcpActionNames = `
admin-setupMonitoring
ai-analyzeLogs
ai-create
ai-delete
ai-deploy
ai-get
ai-getAll
ai-getEnabledProviders
ai-getModels
ai-one
ai-suggest
ai-testConnection
ai-update
application-cancelDeployment
application-cleanQueues
application-clearDeployments
application-create
application-delete
application-deploy
application-disconnectGitProvider
application-dropDeployment
application-killBuild
application-markRunning
application-move
application-one
application-readAppMonitoring
application-readLogs
application-readTraefikConfig
application-redeploy
application-refreshToken
application-reload
application-saveBitbucketProvider
application-saveBuildType
application-saveDockerProvider
application-saveEnvironment
application-saveGitProvider
application-saveGiteaProvider
application-saveGithubProvider
application-saveGitlabProvider
application-search
application-start
application-stop
application-update
application-updateTraefikConfig
auditLog-all
backup-create
backup-listBackupFiles
backup-manualBackupCompose
backup-manualBackupLibsql
backup-manualBackupMariadb
backup-manualBackupMongo
backup-manualBackupMySql
backup-manualBackupPostgres
backup-manualBackupWebServer
backup-one
backup-remove
backup-update
bitbucket-bitbucketProviders
bitbucket-create
bitbucket-getBitbucketBranches
bitbucket-getBitbucketRepositories
bitbucket-one
bitbucket-testConnection
bitbucket-update
certificates-all
certificates-create
certificates-one
certificates-remove
certificates-update
cluster-addManager
cluster-addWorker
cluster-getNodes
cluster-removeWorker
compose-cancelDeployment
compose-cleanQueues
compose-clearDeployments
compose-create
compose-delete
compose-deploy
compose-deployTemplate
compose-disconnectGitProvider
compose-fetchSourceType
compose-getConvertedCompose
compose-getDefaultCommand
compose-getTags
compose-import
compose-isolatedDeployment
compose-killBuild
compose-loadMountsByService
compose-loadServices
compose-move
compose-one
compose-processTemplate
compose-randomizeCompose
compose-readLogs
compose-redeploy
compose-refreshToken
compose-saveEnvironment
compose-search
compose-start
compose-stop
compose-templates
compose-update
customRole-all
customRole-create
customRole-getStatements
customRole-membersByRole
customRole-remove
customRole-update
deployment-all
deployment-allByCompose
deployment-allByServer
deployment-allByType
deployment-allCentralized
deployment-killProcess
deployment-queueList
deployment-removeDeployment
destination-all
destination-create
destination-one
destination-remove
destination-testConnection
destination-update
docker-getConfig
docker-getContainers
docker-getContainersByAppLabel
docker-getContainersByAppNameMatch
docker-getServiceContainersByAppName
docker-getStackContainersByAppName
docker-killContainer
docker-removeContainer
docker-restartContainer
docker-startContainer
docker-stopContainer
docker-uploadFileToContainer
domain-byApplicationId
domain-byComposeId
domain-canGenerateTraefikMeDomains
domain-create
domain-delete
domain-generateDomain
domain-one
domain-update
domain-validateDomain
environment-byProjectId
environment-create
environment-duplicate
environment-one
environment-remove
environment-search
environment-update
gitProvider-allForPermissions
gitProvider-getAll
gitProvider-remove
gitProvider-toggleShare
gitea-create
gitea-getGiteaBranches
gitea-getGiteaRepositories
gitea-getGiteaUrl
gitea-giteaProviders
gitea-one
gitea-testConnection
gitea-update
github-getGithubBranches
github-getGithubRepositories
github-githubProviders
github-one
github-testConnection
github-update
gitlab-create
gitlab-getGitlabBranches
gitlab-getGitlabRepositories
gitlab-gitlabProviders
gitlab-one
gitlab-testConnection
gitlab-update
libsql-changeStatus
libsql-create
libsql-deploy
libsql-move
libsql-one
libsql-readLogs
libsql-rebuild
libsql-reload
libsql-remove
libsql-saveEnvironment
libsql-saveExternalPorts
libsql-start
libsql-stop
libsql-update
licenseKey-activate
licenseKey-deactivate
licenseKey-getEnterpriseSettings
licenseKey-haveValidLicenseKey
licenseKey-updateEnterpriseSettings
licenseKey-validate
mariadb-changePassword
mariadb-changeStatus
mariadb-create
mariadb-deploy
mariadb-move
mariadb-one
mariadb-readLogs
mariadb-rebuild
mariadb-reload
mariadb-remove
mariadb-saveEnvironment
mariadb-saveExternalPort
mariadb-search
mariadb-start
mariadb-stop
mariadb-update
mongo-changePassword
mongo-changeStatus
mongo-create
mongo-deploy
mongo-move
mongo-one
mongo-readLogs
mongo-rebuild
mongo-reload
mongo-remove
mongo-saveEnvironment
mongo-saveExternalPort
mongo-search
mongo-start
mongo-stop
mongo-update
mounts-allNamedByApplicationId
mounts-create
mounts-listByServiceId
mounts-one
mounts-remove
mounts-update
mysql-changePassword
mysql-changeStatus
mysql-create
mysql-deploy
mysql-move
mysql-one
mysql-readLogs
mysql-rebuild
mysql-reload
mysql-remove
mysql-saveEnvironment
mysql-saveExternalPort
mysql-search
mysql-start
mysql-stop
mysql-update
notification-all
notification-createCustom
notification-createDiscord
notification-createEmail
notification-createGotify
notification-createLark
notification-createMattermost
notification-createNtfy
notification-createPushover
notification-createResend
notification-createSlack
notification-createTeams
notification-createTelegram
notification-getEmailProviders
notification-one
notification-receiveNotification
notification-remove
notification-testCustomConnection
notification-testDiscordConnection
notification-testEmailConnection
notification-testGotifyConnection
notification-testLarkConnection
notification-testMattermostConnection
notification-testNtfyConnection
notification-testPushoverConnection
notification-testResendConnection
notification-testSlackConnection
notification-testTeamsConnection
notification-testTelegramConnection
notification-updateCustom
notification-updateDiscord
notification-updateEmail
notification-updateGotify
notification-updateLark
notification-updateMattermost
notification-updateNtfy
notification-updatePushover
notification-updateResend
notification-updateSlack
notification-updateTeams
notification-updateTelegram
organization-active
organization-all
organization-allInvitations
organization-create
organization-delete
organization-inviteMember
organization-one
organization-removeInvitation
organization-setDefault
organization-update
organization-updateMemberRole
patch-byEntityId
patch-cleanPatchRepos
patch-create
patch-delete
patch-ensureRepo
patch-markFileForDeletion
patch-one
patch-readRepoDirectories
patch-readRepoFile
patch-saveFileAsPatch
patch-toggleEnabled
patch-update
port-create
port-delete
port-one
port-update
postgres-changePassword
postgres-changeStatus
postgres-create
postgres-deploy
postgres-move
postgres-one
postgres-readLogs
postgres-rebuild
postgres-reload
postgres-remove
postgres-saveEnvironment
postgres-saveExternalPort
postgres-search
postgres-start
postgres-stop
postgres-update
previewDeployment-all
previewDeployment-delete
previewDeployment-one
previewDeployment-redeploy
project-all
project-allForPermissions
project-create
project-duplicate
project-homeStats
project-one
project-remove
project-search
project-update
redirects-create
redirects-delete
redirects-one
redirects-update
redis-changePassword
redis-changeStatus
redis-create
redis-deploy
redis-move
redis-one
redis-readLogs
redis-rebuild
redis-reload
redis-remove
redis-saveEnvironment
redis-saveExternalPort
redis-search
redis-start
redis-stop
redis-update
registry-all
registry-create
registry-one
registry-remove
registry-testRegistry
registry-testRegistryById
registry-update
rollback-delete
rollback-rollback
schedule-create
schedule-delete
schedule-list
schedule-one
schedule-runManually
schedule-update
security-create
security-delete
security-one
security-update
server-all
server-allForPermissions
server-buildServers
server-count
server-create
server-getDefaultCommand
server-getServerMetrics
server-getServerTime
server-one
server-publicIp
server-remove
server-security
server-setup
server-setupMonitoring
server-update
server-validate
server-withSSHKey
settings-assignDomainServer
settings-checkGPUStatus
settings-checkInfrastructureHealth
settings-cleanAll
settings-cleanAllDeploymentQueue
settings-cleanDockerBuilder
settings-cleanDockerPrune
settings-cleanMonitoring
settings-cleanRedis
settings-cleanSSHPrivateKey
settings-cleanStoppedContainers
settings-cleanUnusedImages
settings-cleanUnusedVolumes
settings-getDockerDiskUsage
settings-getDokployCloudIps
settings-getDokployVersion
settings-getIp
settings-getLogCleanupStatus
settings-getOpenApiDocument
settings-getReleaseTag
settings-getTraefikPorts
settings-getUpdateData
settings-getWebServerSettings
settings-haveActivateRequests
settings-haveTraefikDashboardPortEnabled
settings-health
settings-isCloud
settings-isUserSubscribed
settings-readDirectories
settings-readMiddlewareTraefikConfig
settings-readTraefikConfig
settings-readTraefikEnv
settings-readTraefikFile
settings-readWebServerTraefikConfig
settings-reloadRedis
settings-reloadServer
settings-reloadTraefik
settings-saveSSHPrivateKey
settings-setupGPU
settings-toggleDashboard
settings-toggleRequests
settings-updateDockerCleanup
settings-updateLogCleanup
settings-updateMiddlewareTraefikConfig
settings-updateServer
settings-updateServerIp
settings-updateTraefikConfig
settings-updateTraefikFile
settings-updateTraefikPorts
settings-updateWebServerTraefikConfig
settings-writeTraefikEnv
sshKey-all
sshKey-allForApps
sshKey-create
sshKey-generate
sshKey-one
sshKey-remove
sshKey-update
sso-addTrustedOrigin
sso-deleteProvider
sso-getTrustedOrigins
sso-listProviders
sso-one
sso-register
sso-removeTrustedOrigin
sso-showSignInWithSSO
sso-update
sso-updateTrustedOrigin
stripe-canCreateMoreServers
stripe-createCheckoutSession
stripe-createCustomerPortalSession
stripe-getCurrentPlan
stripe-getInvoices
stripe-getProducts
stripe-updateInvoiceNotifications
stripe-upgradeSubscription
swarm-getContainerStats
swarm-getNodeApps
swarm-getNodeInfo
swarm-getNodes
tag-all
tag-assignToProject
tag-bulkAssign
tag-create
tag-one
tag-remove
tag-removeFromProject
tag-update
user-all
user-assignPermissions
user-checkUserOrganizations
user-createApiKey
user-createUserWithCredentials
user-deleteApiKey
user-generateToken
user-get
user-getBackups
user-getBookmarkedTemplates
user-getContainerMetrics
user-getInvitations
user-getMetricsToken
user-getPermissions
user-getServerMetrics
user-getUserByToken
user-haveRootAccess
user-one
user-remove
user-sendInvitation
user-session
user-toggleTemplateBookmark
user-update
volumeBackups-create
volumeBackups-delete
volumeBackups-list
volumeBackups-one
volumeBackups-runManually
volumeBackups-update
whitelabeling-get
whitelabeling-getPublic
whitelabeling-reset
whitelabeling-update
`
  .trim()
  .split("\n");

function requireOperation(name: string): DokployOperation {
  const operation = dokployOperationByActionName.get(name);
  if (!operation) throw new Error(`Missing Dokploy operation: ${name}`);
  return operation;
}

describe("Dokploy generated operation contract", () => {
  it("has exact parity with the fixed 524-action MCP snapshot", () => {
    expectTypeOf<"application-create">().toMatchTypeOf<DokployActionName>();
    expectTypeOf<"not-a-dokploy-action">().not.toMatchTypeOf<DokployActionName>();
    expectTypeOf<DokployActionName>().not.toEqualTypeOf<string>();
    const names = dokployOperations.map((operation) => operation.name);
    expect(names).toHaveLength(524);
    expect(new Set(names).size).toBe(524);
    expect([...names].sort()).toEqual(expectedMcpActionNames);
  });

  it("keeps the expected domain split", () => {
    const tags = new Set(dokployOperations.map((operation) => operation.tag));
    expect(tags.size).toBe(48);
    expect(tags).not.toContain(undefined);
  });

  it("defines one action and executable handler for every operation", () => {
    const operationNames = dokployOperations.map((operation) => operation.name).sort();
    expect(dokployActions.map((action) => action.name).sort()).toEqual(operationNames);
    expect(Object.keys(dokployActionHandlers).sort()).toEqual(operationNames);
    for (const name of operationNames) {
      expect(dokployActionHandlers[name]).toEqual(expect.any(Function));
    }
  });

  it("preserves representative input schema constraints", () => {
    expect(requireOperation("application-create").inputSchema).toMatchObject({
      type: "object",
      additionalProperties: false,
      required: ["environmentId", "name"],
      properties: {
        name: { type: "string", minLength: 1 },
        appName: {
          type: "string",
          minLength: 1,
          maxLength: 63,
          pattern: "^[a-zA-Z0-9._-]+$",
        },
        description: { anyOf: [{ type: "string" }, { type: "null" }] },
      },
    });
    expect(requireOperation("project-search").inputSchema).toMatchObject({
      type: "object",
      additionalProperties: false,
      properties: {
        limit: { type: "number", default: 20, minimum: 1, maximum: 100 },
        offset: { type: "number", default: 0, minimum: 0 },
      },
    });
    expect(requireOperation("mongo-create").inputSchema).toMatchObject({
      properties: { dockerImage: { type: "string", default: "mongo:8" } },
    });
  });

  it("marks exactly the two transit-file operations as multipart", () => {
    const multipart = dokployOperations
      .filter((operation) => operation.contentType === "multipart/form-data")
      .map(({ name, bodyFields, fileFields }) => ({ name, bodyFields, fileFields }));

    expect(multipart).toEqual([
      {
        name: "application-dropDeployment",
        bodyFields: ["applicationId", "zip", "dropBuildPath"],
        fileFields: ["zip"],
      },
      {
        name: "docker-uploadFileToContainer",
        bodyFields: ["containerId", "file", "destinationPath", "serverId"],
        fileFields: ["file"],
      },
    ]);
    for (const { name, fileFields } of multipart) {
      const properties = requireOperation(name).inputSchema.properties as Record<string, Record<string, unknown>>;
      for (const field of fileFields ?? []) {
        expect(properties[field]).toMatchObject({
          type: "object",
          required: ["fileId"],
          additionalProperties: false,
          properties: { fileId: { type: "string", minLength: 1 } },
        });
      }
    }
  });
});
