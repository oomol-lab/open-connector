import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "docker_hub";

const stringArray = (description: string): JsonSchema => s.stringArray(description);
const page = s.integer({ minimum: 1, description: "The page number to retrieve." });
const pageSize = s.integer({ minimum: 1, maximum: 100, description: "The number of results to return per page." });

const category = s.object(
  {
    name: s.string({ description: "The human-readable repository category name." }),
    slug: s.string({ description: "The URL-friendly repository category identifier." }),
  },
  { description: "A Docker Hub repository category." },
);
const permissions = s.object(
  {
    read: s.boolean({ description: "Whether read access is available." }),
    write: s.boolean({ description: "Whether write access is available." }),
    admin: s.boolean({ description: "Whether admin access is available." }),
  },
  { description: "The repository permissions visible to the current credential." },
);
const immutableTagsSettings = s.object(
  {
    enabled: s.boolean({ description: "Whether immutable tags are enabled for the repository." }),
    rules: stringArray("The immutable tag rules configured for the repository."),
  },
  { description: "The immutable tag configuration for the repository." },
);
const repositorySummary = s.object(
  {
    name: s.string({ description: "The repository name." }),
    namespace: s.string({ description: "The namespace that owns the repository." }),
    repositoryType: s.nullableString("The repository type, such as image or plugin."),
    status: s.integer({ description: "The numeric repository status code." }),
    statusDescription: s.string({ description: "The human-readable repository status." }),
    description: s.nullableString("The short repository description, when available."),
    isPrivate: s.boolean({ description: "Whether the repository is private." }),
    starCount: s.integer({ description: "The number of stars on the repository." }),
    pullCount: s.integer({ description: "The total number of pulls for the repository." }),
    lastUpdated: s.nullableString("The ISO 8601 timestamp when the repository was last updated."),
    lastModified: s.nullableString("The ISO 8601 timestamp when the repository was last modified."),
    dateRegistered: s.nullableString("The ISO 8601 timestamp when the repository was created."),
    affiliation: s.nullableString("The current user's affiliation with the repository, when available."),
    mediaTypes: stringArray("The media types supported by the repository."),
    contentTypes: stringArray("The content types supported by the repository."),
    categories: s.array(category, { description: "The categories assigned to the repository." }),
    storageSize: s.nullableInteger("The repository storage size in bytes, when available."),
  },
  { description: "A Docker Hub repository summary." },
);
const repositoryDetail = s.object(
  {
    ...(repositorySummary.properties as Record<string, JsonSchema>),
    user: s.nullableString("The repository owner username, when available."),
    hubUser: s.nullableString("The Docker Hub user associated with the repository, when available."),
    collaboratorCount: s.nullableInteger("The number of collaborators on the repository, when available."),
    fullDescription: s.nullableString("The full repository description, when available."),
    hasStarred: s.nullableBoolean("Whether the current user has starred the repository, when available."),
    permissions: s.nullable(permissions),
    immutableTagsSettings: s.nullable(immutableTagsSettings),
    source: s.nullableString("The repository source metadata, when available."),
  },
  { description: "Detailed Docker Hub repository metadata." },
);
const layer = s.object(
  {
    digest: s.nullableString("The image layer digest, when available."),
    size: s.nullableInteger("The image layer size in bytes, when available."),
    instruction: s.nullableString("The Dockerfile instruction associated with the layer, when available."),
  },
  { description: "A Docker image layer." },
);
const image = s.object(
  {
    architecture: s.nullableString("The CPU architecture for the image variant, when available."),
    features: s.nullableString("The CPU feature set reported for the image variant, when available."),
    variant: s.nullableString("The CPU variant reported for the image variant, when available."),
    digest: s.nullableString("The image manifest digest, when available."),
    layers: s.array(layer, { description: "The image layers included in the image variant." }),
    os: s.nullableString("The operating system for the image variant, when available."),
    osFeatures: s.nullableString("The operating system features reported for the image variant, when available."),
    osVersion: s.nullableString("The operating system version for the image variant, when available."),
    size: s.nullableInteger("The image size in bytes, when available."),
    status: s.nullableString("The image status returned by Docker Hub, when available."),
    lastPulled: s.nullableString("The ISO 8601 timestamp when the image variant was last pulled."),
    lastPushed: s.nullableString("The ISO 8601 timestamp when the image variant was last pushed."),
  },
  { description: "A platform-specific Docker image variant." },
);
const tag = s.object(
  {
    id: s.nullableInteger("The numeric tag identifier, when available."),
    name: s.string({ description: "The repository tag name." }),
    creator: s.nullableInteger("The user ID that originally created the tag."),
    lastUpdated: s.nullableString("The ISO 8601 timestamp when the tag was last updated."),
    lastUpdater: s.nullableInteger("The user ID that last updated the tag."),
    lastUpdaterUsername: s.nullableString("The Docker Hub username that last updated the tag."),
    repository: s.nullableInteger("The numeric repository identifier."),
    fullSize: s.nullableInteger("The compressed tag size in bytes."),
    status: s.nullableString("The current Docker Hub tag status."),
    tagLastPulled: s.nullableString("The ISO 8601 timestamp when the tag was last pulled."),
    tagLastPushed: s.nullableString("The ISO 8601 timestamp when the tag was last pushed."),
    images: s.array(image, { description: "The image variants currently published for the tag." }),
  },
  { description: "A Docker Hub repository tag." },
);
const orgMember = s.object(
  {
    id: s.nullableString("The member identifier, when available."),
    username: s.nullableString("The Docker Hub username of the member."),
    fullName: s.nullableString("The full name of the member, when available."),
    email: s.nullableString("The email address of the member, when available."),
    type: s.nullableString("The Docker Hub member type, when available."),
    role: s.nullableString("The organization role assigned to the member."),
    groups: stringArray("The teams that include the member."),
    isGuest: s.nullableBoolean("Whether the member is marked as a guest in the organization."),
    dateJoined: s.nullableString("The ISO 8601 timestamp when the member joined the organization."),
    lastLoggedInAt: s.nullableString("The ISO 8601 timestamp when the member last logged in, when visible."),
    lastSeenAt: s.nullableString("The ISO 8601 timestamp when the member was last seen, when visible."),
    lastDesktopVersion: s.nullableString("The last Docker Desktop version seen for the member, when visible."),
  },
  { description: "A Docker Hub organization member." },
);
const team = s.object(
  {
    id: s.nullableInteger("The numeric team identifier, when available."),
    uuid: s.nullableString("The stable UUID of the team, when available."),
    name: s.nullableString("The team name."),
    description: s.nullableString("The team description, when available."),
    memberCount: s.nullableInteger("The number of members in the team."),
  },
  { description: "A Docker Hub organization team." },
);
const teamMember = s.object(
  {
    id: s.nullableString("The member identifier, when available."),
    username: s.nullableString("The Docker Hub username of the team member."),
    fullName: s.nullableString("The full name of the team member, when available."),
    email: s.nullableString("The email address of the team member, when available."),
    company: s.nullableString("The company value returned for the member, when available."),
    location: s.nullableString("The location value returned for the member, when available."),
    profileUrl: s.nullableString("The profile URL returned for the member, when available."),
    type: s.nullableString("The Docker Hub member type, when available."),
    dateJoined: s.nullableString("The ISO 8601 timestamp when the member joined the team."),
  },
  { description: "A Docker Hub team member." },
);
const orgAccessTokenResource = s.object(
  {
    type: s.nullableString("The organization access token resource type."),
    path: s.nullableString("The resource path granted to the token."),
    scopes: stringArray("The scopes granted for the resource."),
  },
  { description: "A Docker Hub organization access token resource grant." },
);
const orgAccessToken = s.object(
  {
    id: s.nullableString("The organization access token identifier."),
    label: s.nullableString("The organization access token label."),
    createdBy: s.nullableString("The username that created the token, when available."),
    isActive: s.nullableBoolean("Whether the organization access token is active."),
    createdAt: s.nullableString("The ISO 8601 timestamp when the token was created."),
    expiresAt: s.nullableString("The ISO 8601 timestamp when the token expires, when available."),
    lastUsedAt: s.nullableString("The ISO 8601 timestamp when the token was last used, when available."),
    resources: s.array(orgAccessTokenResource, { description: "The resource grants attached to the token." }),
  },
  { description: "A Docker Hub organization access token." },
);
const invite = s.object(
  {
    id: s.nullableString("The invite identifier, when available."),
    inviterUsername: s.nullableString("The Docker Hub username that created the invite, when available."),
    invitee: s.nullableString("The invited Docker ID or email address."),
    org: s.nullableString("The organization that owns the invite."),
    team: s.nullableString("The team attached to the invite, when available."),
    createdAt: s.nullableString("The ISO 8601 timestamp when the invite was created, when available."),
  },
  { description: "A Docker Hub organization invite." },
);
const bulkInviteResult = s.object(
  {
    invitee: s.nullableString("The invited Docker ID or email address."),
    status: s.nullableString("The invite creation result status."),
    invite: s.nullable(invite),
  },
  { description: "A single Docker Hub bulk invite result." },
);

export type DockerHubActionName =
  | "list_repositories"
  | "get_repository"
  | "create_repository"
  | "get_tag"
  | "get_image"
  | "list_org_members"
  | "add_org_member"
  | "remove_org_member"
  | "list_org_access_tokens"
  | "list_teams"
  | "get_team"
  | "delete_team"
  | "list_team_members"
  | "remove_team_member";

export const dockerHubActions: ActionDefinition[] = [
  action(
    "list_repositories",
    "read",
    "List Docker Hub repositories in a namespace with optional name filtering and ordering.",
    {
      namespace: s.nonEmptyString("The namespace that owns the repositories."),
      page,
      pageSize,
      name: s.nonEmptyString("An optional partial repository name filter."),
      ordering: s.stringEnum(["name", "-name", "last_updated", "-last_updated", "pull_count", "-pull_count"], {
        description: "The field and direction used to order repositories.",
      }),
    },
    ["namespace"],
    pageOutput(repositorySummary, "A paginated Docker Hub repository list."),
  ),
  action(
    "get_repository",
    "read",
    "Get detailed metadata for a Docker Hub repository within a namespace.",
    repositoryInput(),
    ["namespace", "repository"],
    s.actionOutput({ repository: repositoryDetail }, "The output payload for retrieving a Docker Hub repository."),
  ),
  action(
    "create_repository",
    "write",
    "Create a Docker Hub repository inside a namespace.",
    {
      namespace: s.nonEmptyString("The namespace where the repository should be created."),
      name: s.string({ minLength: 2, maxLength: 255, description: "The repository name to create." }),
      description: s.string({ maxLength: 100, description: "The short repository description." }),
      fullDescription: s.string({ maxLength: 25000, description: "The detailed repository description." }),
      registry: s.string({ description: "The registry where the repository should be hosted." }),
      isPrivate: s.boolean({ description: "Whether the repository should be created as private." }),
    },
    ["namespace", "name"],
    s.actionOutput({ repository: repositoryDetail }, "The output payload for creating a Docker Hub repository."),
  ),
  action(
    "get_tag",
    "read",
    "Get metadata and image variants for a specific Docker Hub repository tag.",
    { ...repositoryInput(), tag: s.nonEmptyString("The tag name to retrieve.") },
    ["namespace", "repository", "tag"],
    s.actionOutput({ tag }, "The output payload for retrieving a Docker Hub repository tag."),
  ),
  action(
    "get_image",
    "read",
    "Find a Docker Hub image variant by digest by scanning the repository's published tags.",
    {
      ...repositoryInput(),
      digest: s.nonEmptyString("The image manifest digest to look up."),
      pageSize,
      maxPages: s.integer({ minimum: 1, maximum: 100, description: "The maximum number of tag pages to scan." }),
    },
    ["namespace", "repository", "digest"],
    s.actionOutput({ tag, image }, "The output payload for searching a Docker Hub image by digest."),
  ),
  action(
    "list_org_members",
    "read",
    "List Docker Hub organization members with optional filtering and pagination.",
    {
      orgName: s.nonEmptyString("The Docker Hub organization name."),
      search: s.string({ description: "An optional member search term." }),
      page,
      pageSize,
      invites: s.boolean({ description: "Whether to include invites in the response when supported." }),
      type: s.stringEnum(["all", "invitee", "member"], { description: "The member type filter." }),
      role: s.stringEnum(["owner", "editor", "member"], { description: "The organization role filter." }),
    },
    ["orgName"],
    pageOutput(orgMember, "A paginated Docker Hub organization member list."),
  ),
  action(
    "add_org_member",
    "write",
    "Invite a Docker ID or email address to join a Docker Hub organization.",
    {
      orgName: s.nonEmptyString("The Docker Hub organization name."),
      invitee: s.nonEmptyString("The Docker ID or email address to invite."),
      teamName: s.nonEmptyString("The optional team to attach to the invite."),
      role: s.string({ description: "The optional organization role to assign to the invite." }),
      dryRun: s.boolean({ description: "Whether to validate the invite without creating it." }),
    },
    ["orgName", "invitee"],
    s.actionOutput(
      {
        invitees: s.array(bulkInviteResult, {
          description: "The invite results returned by the bulk invite endpoint.",
        }),
      },
      "The output payload for inviting a member to a Docker Hub organization.",
    ),
  ),
  action(
    "remove_org_member",
    "destructive",
    "Remove a member from a Docker Hub organization.",
    {
      orgName: s.nonEmptyString("The Docker Hub organization name."),
      username: s.nonEmptyString("The Docker Hub username to remove."),
    },
    ["orgName", "username"],
    booleanOutput("removed", "Whether the member removal request completed."),
  ),
  action(
    "list_org_access_tokens",
    "read",
    "List Docker Hub organization access tokens for an organization.",
    {
      orgName: s.nonEmptyString("The Docker Hub organization name."),
      page,
      pageSize,
    },
    ["orgName"],
    s.object(
      {
        total: s.integer({ description: "The total number of organization access tokens." }),
        next: s.nullableString("The URL for the next page, or null when unavailable."),
        previous: s.nullableString("The URL for the previous page, or null when unavailable."),
        results: s.array(orgAccessToken, { description: "The organization access tokens in the current page." }),
      },
      {
        required: ["total", "next", "previous", "results"],
        description: "A paginated Docker Hub organization access token list.",
      },
    ),
  ),
  action(
    "list_teams",
    "read",
    "List Docker Hub teams for an organization.",
    {
      orgName: s.nonEmptyString("The Docker Hub organization name."),
      page,
      pageSize,
      username: s.nonEmptyString("An optional username to filter teams by membership."),
      search: s.nonEmptyString("An optional team search term."),
    },
    ["orgName"],
    pageOutput(team, "A paginated Docker Hub team list."),
  ),
  action(
    "get_team",
    "read",
    "Get a Docker Hub team within an organization.",
    teamInput(),
    ["orgName", "teamName"],
    s.actionOutput({ team }, "The output payload for retrieving a Docker Hub team."),
  ),
  action(
    "delete_team",
    "destructive",
    "Delete a Docker Hub team within an organization.",
    teamInput(),
    ["orgName", "teamName"],
    booleanOutput("deleted", "Whether the team deletion request completed."),
  ),
  action(
    "list_team_members",
    "read",
    "List members of a Docker Hub team within an organization.",
    {
      ...teamInput(),
      page,
      pageSize,
      search: s.nonEmptyString("An optional member search term."),
    },
    ["orgName", "teamName"],
    pageOutput(teamMember, "A paginated Docker Hub team member list."),
  ),
  action(
    "remove_team_member",
    "destructive",
    "Remove a user from a Docker Hub team within an organization.",
    {
      ...teamInput(),
      username: s.nonEmptyString("The Docker Hub username to remove from the team."),
    },
    ["orgName", "teamName", "username"],
    booleanOutput("removed", "Whether the team member removal request completed."),
  ),
];

function action(
  name: DockerHubActionName,
  operationType: ActionDefinition["operationType"],
  description: string,
  input: Record<string, JsonSchema>,
  required: string[],
  output: JsonSchema,
): ActionDefinition {
  return defineProviderAction(service, {
    name,
    operationType,
    description,
    requiredScopes: [],
    inputSchema: s.actionInput(input, required, "The input payload for this action."),
    outputSchema: output,
  });
}

function pageOutput(item: JsonSchema, description: string): JsonSchema {
  return s.object(
    {
      count: s.integer({ description: "The total number of matching items." }),
      next: s.nullableString("The URL for the next page, or null when unavailable."),
      previous: s.nullableString("The URL for the previous page, or null when unavailable."),
      results: s.array(item, { description: "The items in the current page." }),
    },
    { required: ["count", "next", "previous", "results"], description },
  );
}

function repositoryInput(): Record<string, JsonSchema> {
  return {
    namespace: s.nonEmptyString("The namespace that owns the repository."),
    repository: s.nonEmptyString("The repository name."),
  };
}

function teamInput(): Record<string, JsonSchema> {
  return {
    orgName: s.nonEmptyString("The Docker Hub organization name."),
    teamName: s.nonEmptyString("The team name."),
  };
}

function booleanOutput(key: "deleted" | "removed", description: string): JsonSchema {
  return s.actionOutput({ [key]: s.boolean({ description }) }, "The output payload for this action.");
}
