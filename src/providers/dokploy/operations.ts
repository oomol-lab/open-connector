// Generated in part by scripts/generate-dokploy-operations.ts.
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

export interface DokployOperationDefinition {
  name: string;
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
