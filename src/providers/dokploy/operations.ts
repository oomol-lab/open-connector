// Generated in part by src/providers/dokploy/generate.ts.
import type { JsonSchema } from "../../core/types.ts";

import { adminOperations } from "./operations/admin.ts";
import { aiOperations } from "./operations/ai.ts";
import { applicationOperations } from "./operations/application.ts";
import { auditLogOperations } from "./operations/audit-log.ts";
import { backupOperations } from "./operations/backup.ts";
import { bitbucketOperations } from "./operations/bitbucket.ts";
import { certificatesOperations } from "./operations/certificates.ts";
import { clusterOperations } from "./operations/cluster.ts";
import { composeOperations } from "./operations/compose.ts";
import { customRoleOperations } from "./operations/custom-role.ts";
import { deploymentOperations } from "./operations/deployment.ts";
import { destinationOperations } from "./operations/destination.ts";
import { dockerOperations } from "./operations/docker.ts";
import { domainOperations } from "./operations/domain.ts";
import { environmentOperations } from "./operations/environment.ts";
import { gitProviderOperations } from "./operations/git-provider.ts";
import { giteaOperations } from "./operations/gitea.ts";
import { githubOperations } from "./operations/github.ts";
import { gitlabOperations } from "./operations/gitlab.ts";
import { libsqlOperations } from "./operations/libsql.ts";
import { licenseKeyOperations } from "./operations/license-key.ts";
import { mariadbOperations } from "./operations/mariadb.ts";
import { mongoOperations } from "./operations/mongo.ts";
import { mountsOperations } from "./operations/mounts.ts";
import { mysqlOperations } from "./operations/mysql.ts";
import { notificationOperations } from "./operations/notification.ts";
import { organizationOperations } from "./operations/organization.ts";
import { patchOperations } from "./operations/patch.ts";
import { portOperations } from "./operations/port.ts";
import { postgresOperations } from "./operations/postgres.ts";
import { previewDeploymentOperations } from "./operations/preview-deployment.ts";
import { projectOperations } from "./operations/project.ts";
import { redirectsOperations } from "./operations/redirects.ts";
import { redisOperations } from "./operations/redis.ts";
import { registryOperations } from "./operations/registry.ts";
import { rollbackOperations } from "./operations/rollback.ts";
import { scheduleOperations } from "./operations/schedule.ts";
import { securityOperations } from "./operations/security.ts";
import { serverOperations } from "./operations/server.ts";
import { settingsOperations } from "./operations/settings.ts";
import { sshKeyOperations } from "./operations/ssh-key.ts";
import { ssoOperations } from "./operations/sso.ts";
import { stripeOperations } from "./operations/stripe.ts";
import { swarmOperations } from "./operations/swarm.ts";
import { tagOperations } from "./operations/tag.ts";
import { userOperations } from "./operations/user.ts";
import { volumeBackupsOperations } from "./operations/volume-backups.ts";
import { whitelabelingOperations } from "./operations/whitelabeling.ts";

export type DokployActionMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
export type DokployOperationSupportStatus = "supported" | "unsupported";

export type DokployActionName =
  | "admin-setupMonitoring"
  | "ai-analyzeLogs"
  | "ai-create"
  | "ai-delete"
  | "ai-deploy"
  | "ai-get"
  | "ai-getAll"
  | "ai-getEnabledProviders"
  | "ai-getModels"
  | "ai-one"
  | "ai-suggest"
  | "ai-testConnection"
  | "ai-update"
  | "application-cancelDeployment"
  | "application-cleanQueues"
  | "application-clearDeployments"
  | "application-create"
  | "application-delete"
  | "application-deploy"
  | "application-disconnectGitProvider"
  | "application-dropDeployment"
  | "application-killBuild"
  | "application-markRunning"
  | "application-move"
  | "application-one"
  | "application-readAppMonitoring"
  | "application-readLogs"
  | "application-readTraefikConfig"
  | "application-redeploy"
  | "application-refreshToken"
  | "application-reload"
  | "application-saveBitbucketProvider"
  | "application-saveBuildType"
  | "application-saveDockerProvider"
  | "application-saveEnvironment"
  | "application-saveGiteaProvider"
  | "application-saveGithubProvider"
  | "application-saveGitlabProvider"
  | "application-saveGitProvider"
  | "application-search"
  | "application-start"
  | "application-stop"
  | "application-update"
  | "application-updateTraefikConfig"
  | "auditLog-all"
  | "backup-create"
  | "backup-listBackupFiles"
  | "backup-manualBackupCompose"
  | "backup-manualBackupLibsql"
  | "backup-manualBackupMariadb"
  | "backup-manualBackupMongo"
  | "backup-manualBackupMySql"
  | "backup-manualBackupPostgres"
  | "backup-manualBackupWebServer"
  | "backup-one"
  | "backup-remove"
  | "backup-update"
  | "bitbucket-bitbucketProviders"
  | "bitbucket-create"
  | "bitbucket-getBitbucketBranches"
  | "bitbucket-getBitbucketRepositories"
  | "bitbucket-one"
  | "bitbucket-testConnection"
  | "bitbucket-update"
  | "certificates-all"
  | "certificates-create"
  | "certificates-one"
  | "certificates-remove"
  | "certificates-update"
  | "cluster-addManager"
  | "cluster-addWorker"
  | "cluster-getNodes"
  | "cluster-removeWorker"
  | "compose-cancelDeployment"
  | "compose-cleanQueues"
  | "compose-clearDeployments"
  | "compose-create"
  | "compose-delete"
  | "compose-deploy"
  | "compose-deployTemplate"
  | "compose-disconnectGitProvider"
  | "compose-fetchSourceType"
  | "compose-getConvertedCompose"
  | "compose-getDefaultCommand"
  | "compose-getTags"
  | "compose-import"
  | "compose-isolatedDeployment"
  | "compose-killBuild"
  | "compose-loadMountsByService"
  | "compose-loadServices"
  | "compose-move"
  | "compose-one"
  | "compose-processTemplate"
  | "compose-randomizeCompose"
  | "compose-readLogs"
  | "compose-redeploy"
  | "compose-refreshToken"
  | "compose-saveEnvironment"
  | "compose-search"
  | "compose-start"
  | "compose-stop"
  | "compose-templates"
  | "compose-update"
  | "customRole-all"
  | "customRole-create"
  | "customRole-getStatements"
  | "customRole-membersByRole"
  | "customRole-remove"
  | "customRole-update"
  | "deployment-all"
  | "deployment-allByCompose"
  | "deployment-allByServer"
  | "deployment-allByType"
  | "deployment-allCentralized"
  | "deployment-killProcess"
  | "deployment-queueList"
  | "deployment-removeDeployment"
  | "destination-all"
  | "destination-create"
  | "destination-one"
  | "destination-remove"
  | "destination-testConnection"
  | "destination-update"
  | "docker-getConfig"
  | "docker-getContainers"
  | "docker-getContainersByAppLabel"
  | "docker-getContainersByAppNameMatch"
  | "docker-getServiceContainersByAppName"
  | "docker-getStackContainersByAppName"
  | "docker-killContainer"
  | "docker-removeContainer"
  | "docker-restartContainer"
  | "docker-startContainer"
  | "docker-stopContainer"
  | "docker-uploadFileToContainer"
  | "domain-byApplicationId"
  | "domain-byComposeId"
  | "domain-canGenerateTraefikMeDomains"
  | "domain-create"
  | "domain-delete"
  | "domain-generateDomain"
  | "domain-one"
  | "domain-update"
  | "domain-validateDomain"
  | "environment-byProjectId"
  | "environment-create"
  | "environment-duplicate"
  | "environment-one"
  | "environment-remove"
  | "environment-search"
  | "environment-update"
  | "gitea-create"
  | "gitea-getGiteaBranches"
  | "gitea-getGiteaRepositories"
  | "gitea-getGiteaUrl"
  | "gitea-giteaProviders"
  | "gitea-one"
  | "gitea-testConnection"
  | "gitea-update"
  | "github-getGithubBranches"
  | "github-getGithubRepositories"
  | "github-githubProviders"
  | "github-one"
  | "github-testConnection"
  | "github-update"
  | "gitlab-create"
  | "gitlab-getGitlabBranches"
  | "gitlab-getGitlabRepositories"
  | "gitlab-gitlabProviders"
  | "gitlab-one"
  | "gitlab-testConnection"
  | "gitlab-update"
  | "gitProvider-allForPermissions"
  | "gitProvider-getAll"
  | "gitProvider-remove"
  | "gitProvider-toggleShare"
  | "libsql-changeStatus"
  | "libsql-create"
  | "libsql-deploy"
  | "libsql-move"
  | "libsql-one"
  | "libsql-readLogs"
  | "libsql-rebuild"
  | "libsql-reload"
  | "libsql-remove"
  | "libsql-saveEnvironment"
  | "libsql-saveExternalPorts"
  | "libsql-start"
  | "libsql-stop"
  | "libsql-update"
  | "licenseKey-activate"
  | "licenseKey-deactivate"
  | "licenseKey-getEnterpriseSettings"
  | "licenseKey-haveValidLicenseKey"
  | "licenseKey-updateEnterpriseSettings"
  | "licenseKey-validate"
  | "mariadb-changePassword"
  | "mariadb-changeStatus"
  | "mariadb-create"
  | "mariadb-deploy"
  | "mariadb-move"
  | "mariadb-one"
  | "mariadb-readLogs"
  | "mariadb-rebuild"
  | "mariadb-reload"
  | "mariadb-remove"
  | "mariadb-saveEnvironment"
  | "mariadb-saveExternalPort"
  | "mariadb-search"
  | "mariadb-start"
  | "mariadb-stop"
  | "mariadb-update"
  | "mongo-changePassword"
  | "mongo-changeStatus"
  | "mongo-create"
  | "mongo-deploy"
  | "mongo-move"
  | "mongo-one"
  | "mongo-readLogs"
  | "mongo-rebuild"
  | "mongo-reload"
  | "mongo-remove"
  | "mongo-saveEnvironment"
  | "mongo-saveExternalPort"
  | "mongo-search"
  | "mongo-start"
  | "mongo-stop"
  | "mongo-update"
  | "mounts-allNamedByApplicationId"
  | "mounts-create"
  | "mounts-listByServiceId"
  | "mounts-one"
  | "mounts-remove"
  | "mounts-update"
  | "mysql-changePassword"
  | "mysql-changeStatus"
  | "mysql-create"
  | "mysql-deploy"
  | "mysql-move"
  | "mysql-one"
  | "mysql-readLogs"
  | "mysql-rebuild"
  | "mysql-reload"
  | "mysql-remove"
  | "mysql-saveEnvironment"
  | "mysql-saveExternalPort"
  | "mysql-search"
  | "mysql-start"
  | "mysql-stop"
  | "mysql-update"
  | "notification-all"
  | "notification-createCustom"
  | "notification-createDiscord"
  | "notification-createEmail"
  | "notification-createGotify"
  | "notification-createLark"
  | "notification-createMattermost"
  | "notification-createNtfy"
  | "notification-createPushover"
  | "notification-createResend"
  | "notification-createSlack"
  | "notification-createTeams"
  | "notification-createTelegram"
  | "notification-getEmailProviders"
  | "notification-one"
  | "notification-receiveNotification"
  | "notification-remove"
  | "notification-testCustomConnection"
  | "notification-testDiscordConnection"
  | "notification-testEmailConnection"
  | "notification-testGotifyConnection"
  | "notification-testLarkConnection"
  | "notification-testMattermostConnection"
  | "notification-testNtfyConnection"
  | "notification-testPushoverConnection"
  | "notification-testResendConnection"
  | "notification-testSlackConnection"
  | "notification-testTeamsConnection"
  | "notification-testTelegramConnection"
  | "notification-updateCustom"
  | "notification-updateDiscord"
  | "notification-updateEmail"
  | "notification-updateGotify"
  | "notification-updateLark"
  | "notification-updateMattermost"
  | "notification-updateNtfy"
  | "notification-updatePushover"
  | "notification-updateResend"
  | "notification-updateSlack"
  | "notification-updateTeams"
  | "notification-updateTelegram"
  | "organization-active"
  | "organization-all"
  | "organization-allInvitations"
  | "organization-create"
  | "organization-delete"
  | "organization-inviteMember"
  | "organization-one"
  | "organization-removeInvitation"
  | "organization-setDefault"
  | "organization-update"
  | "organization-updateMemberRole"
  | "patch-byEntityId"
  | "patch-cleanPatchRepos"
  | "patch-create"
  | "patch-delete"
  | "patch-ensureRepo"
  | "patch-markFileForDeletion"
  | "patch-one"
  | "patch-readRepoDirectories"
  | "patch-readRepoFile"
  | "patch-saveFileAsPatch"
  | "patch-toggleEnabled"
  | "patch-update"
  | "port-create"
  | "port-delete"
  | "port-one"
  | "port-update"
  | "postgres-changePassword"
  | "postgres-changeStatus"
  | "postgres-create"
  | "postgres-deploy"
  | "postgres-move"
  | "postgres-one"
  | "postgres-readLogs"
  | "postgres-rebuild"
  | "postgres-reload"
  | "postgres-remove"
  | "postgres-saveEnvironment"
  | "postgres-saveExternalPort"
  | "postgres-search"
  | "postgres-start"
  | "postgres-stop"
  | "postgres-update"
  | "previewDeployment-all"
  | "previewDeployment-delete"
  | "previewDeployment-one"
  | "previewDeployment-redeploy"
  | "project-all"
  | "project-allForPermissions"
  | "project-create"
  | "project-duplicate"
  | "project-homeStats"
  | "project-one"
  | "project-remove"
  | "project-search"
  | "project-update"
  | "redirects-create"
  | "redirects-delete"
  | "redirects-one"
  | "redirects-update"
  | "redis-changePassword"
  | "redis-changeStatus"
  | "redis-create"
  | "redis-deploy"
  | "redis-move"
  | "redis-one"
  | "redis-readLogs"
  | "redis-rebuild"
  | "redis-reload"
  | "redis-remove"
  | "redis-saveEnvironment"
  | "redis-saveExternalPort"
  | "redis-search"
  | "redis-start"
  | "redis-stop"
  | "redis-update"
  | "registry-all"
  | "registry-create"
  | "registry-one"
  | "registry-remove"
  | "registry-testRegistry"
  | "registry-testRegistryById"
  | "registry-update"
  | "rollback-delete"
  | "rollback-rollback"
  | "schedule-create"
  | "schedule-delete"
  | "schedule-list"
  | "schedule-one"
  | "schedule-runManually"
  | "schedule-update"
  | "security-create"
  | "security-delete"
  | "security-one"
  | "security-update"
  | "server-all"
  | "server-allForPermissions"
  | "server-buildServers"
  | "server-count"
  | "server-create"
  | "server-getDefaultCommand"
  | "server-getServerMetrics"
  | "server-getServerTime"
  | "server-one"
  | "server-publicIp"
  | "server-remove"
  | "server-security"
  | "server-setup"
  | "server-setupMonitoring"
  | "server-update"
  | "server-validate"
  | "server-withSSHKey"
  | "settings-assignDomainServer"
  | "settings-checkGPUStatus"
  | "settings-checkInfrastructureHealth"
  | "settings-cleanAll"
  | "settings-cleanAllDeploymentQueue"
  | "settings-cleanDockerBuilder"
  | "settings-cleanDockerPrune"
  | "settings-cleanMonitoring"
  | "settings-cleanRedis"
  | "settings-cleanSSHPrivateKey"
  | "settings-cleanStoppedContainers"
  | "settings-cleanUnusedImages"
  | "settings-cleanUnusedVolumes"
  | "settings-getDockerDiskUsage"
  | "settings-getDokployCloudIps"
  | "settings-getDokployVersion"
  | "settings-getIp"
  | "settings-getLogCleanupStatus"
  | "settings-getOpenApiDocument"
  | "settings-getReleaseTag"
  | "settings-getTraefikPorts"
  | "settings-getUpdateData"
  | "settings-getWebServerSettings"
  | "settings-haveActivateRequests"
  | "settings-haveTraefikDashboardPortEnabled"
  | "settings-health"
  | "settings-isCloud"
  | "settings-isUserSubscribed"
  | "settings-readDirectories"
  | "settings-readMiddlewareTraefikConfig"
  | "settings-readTraefikConfig"
  | "settings-readTraefikEnv"
  | "settings-readTraefikFile"
  | "settings-readWebServerTraefikConfig"
  | "settings-reloadRedis"
  | "settings-reloadServer"
  | "settings-reloadTraefik"
  | "settings-saveSSHPrivateKey"
  | "settings-setupGPU"
  | "settings-toggleDashboard"
  | "settings-toggleRequests"
  | "settings-updateDockerCleanup"
  | "settings-updateLogCleanup"
  | "settings-updateMiddlewareTraefikConfig"
  | "settings-updateServer"
  | "settings-updateServerIp"
  | "settings-updateTraefikConfig"
  | "settings-updateTraefikFile"
  | "settings-updateTraefikPorts"
  | "settings-updateWebServerTraefikConfig"
  | "settings-writeTraefikEnv"
  | "sshKey-all"
  | "sshKey-allForApps"
  | "sshKey-create"
  | "sshKey-generate"
  | "sshKey-one"
  | "sshKey-remove"
  | "sshKey-update"
  | "sso-addTrustedOrigin"
  | "sso-deleteProvider"
  | "sso-getTrustedOrigins"
  | "sso-listProviders"
  | "sso-one"
  | "sso-register"
  | "sso-removeTrustedOrigin"
  | "sso-showSignInWithSSO"
  | "sso-update"
  | "sso-updateTrustedOrigin"
  | "stripe-canCreateMoreServers"
  | "stripe-createCheckoutSession"
  | "stripe-createCustomerPortalSession"
  | "stripe-getCurrentPlan"
  | "stripe-getInvoices"
  | "stripe-getProducts"
  | "stripe-updateInvoiceNotifications"
  | "stripe-upgradeSubscription"
  | "swarm-getContainerStats"
  | "swarm-getNodeApps"
  | "swarm-getNodeInfo"
  | "swarm-getNodes"
  | "tag-all"
  | "tag-assignToProject"
  | "tag-bulkAssign"
  | "tag-create"
  | "tag-one"
  | "tag-remove"
  | "tag-removeFromProject"
  | "tag-update"
  | "user-all"
  | "user-assignPermissions"
  | "user-checkUserOrganizations"
  | "user-createApiKey"
  | "user-createUserWithCredentials"
  | "user-deleteApiKey"
  | "user-generateToken"
  | "user-get"
  | "user-getBackups"
  | "user-getBookmarkedTemplates"
  | "user-getContainerMetrics"
  | "user-getInvitations"
  | "user-getMetricsToken"
  | "user-getPermissions"
  | "user-getServerMetrics"
  | "user-getUserByToken"
  | "user-haveRootAccess"
  | "user-one"
  | "user-remove"
  | "user-sendInvitation"
  | "user-session"
  | "user-toggleTemplateBookmark"
  | "user-update"
  | "volumeBackups-create"
  | "volumeBackups-delete"
  | "volumeBackups-list"
  | "volumeBackups-one"
  | "volumeBackups-runManually"
  | "volumeBackups-update"
  | "whitelabeling-get"
  | "whitelabeling-getPublic"
  | "whitelabeling-reset"
  | "whitelabeling-update";

export interface DokployOperationDefinition {
  name: DokployActionName;
  operationId?: string;
  tag?: string;
  description: string;
  method: DokployActionMethod;
  path: string;
  pathFields: readonly string[];
  queryFields: readonly string[];
  bodyFields: readonly string[];
  fileFields?: readonly string[];
  contentType?: string | null;
  supportStatus?: DokployOperationSupportStatus;
  supportReason?: string;
  inputSchema: JsonSchema;
  outputSchema: JsonSchema;
}

export type DokployOperation = DokployOperationDefinition;

export const dokployOperations: readonly DokployOperation[] = [
  adminOperations,
  aiOperations,
  applicationOperations,
  auditLogOperations,
  backupOperations,
  bitbucketOperations,
  certificatesOperations,
  clusterOperations,
  composeOperations,
  customRoleOperations,
  deploymentOperations,
  destinationOperations,
  dockerOperations,
  domainOperations,
  environmentOperations,
  giteaOperations,
  githubOperations,
  gitlabOperations,
  gitProviderOperations,
  libsqlOperations,
  licenseKeyOperations,
  mariadbOperations,
  mongoOperations,
  mountsOperations,
  mysqlOperations,
  notificationOperations,
  organizationOperations,
  patchOperations,
  portOperations,
  postgresOperations,
  previewDeploymentOperations,
  projectOperations,
  redirectsOperations,
  redisOperations,
  registryOperations,
  rollbackOperations,
  scheduleOperations,
  securityOperations,
  serverOperations,
  settingsOperations,
  sshKeyOperations,
  ssoOperations,
  stripeOperations,
  swarmOperations,
  tagOperations,
  userOperations,
  volumeBackupsOperations,
  whitelabelingOperations,
].flat();

export const dokployOperationByActionName: ReadonlyMap<string, DokployOperation> = new Map(
  dokployOperations.map((operation) => [operation.name, operation]),
);
