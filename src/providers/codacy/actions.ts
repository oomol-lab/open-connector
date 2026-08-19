import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "codacy";

const providerField = s.nonEmptyString(
  "Git provider identifier used by Codacy, such as gh for GitHub, gl for GitLab, or bb for Bitbucket.",
);
const remoteOrganizationNameField = s.nonEmptyString("Organization name on the Git provider.");
const repositoryNameField = s.nonEmptyString("Repository name on the Git provider organization.");
const toolUuidField = s.nonEmptyString("The Codacy tool UUID.");
const patternIdField = s.nonEmptyString("Pattern identifier unique within the Codacy tool.");
const cursorField = s.nonEmptyString("Cursor returned by Codacy for requesting the next result page.");
const limitField = s.integer("Maximum number of items to return, from 1 to 100.", {
  minimum: 1,
  maximum: 100,
});

const paginationSchema = s.object(
  "Cursor-based pagination information returned by Codacy.",
  {
    cursor: s.nonEmptyString("Cursor to request the next batch of results."),
    limit: s.integer("Maximum number of items returned by Codacy."),
    total: s.integer("Total number of items returned by Codacy."),
  },
  { optional: ["cursor", "limit", "total"] },
);

const userSchema = s.looseObject("The authenticated Codacy user.", {
  id: s.integer("The Codacy user identifier."),
  name: s.nonEmptyString("The user's display name."),
  mainEmail: s.email("The user's primary email address."),
  otherEmails: s.array(
    "Other email addresses associated with the user.",
    s.email("An email address associated with the user."),
  ),
  isAdmin: s.boolean("Whether the user has Codacy administrator privileges."),
  isActive: s.boolean("Whether the user account is active."),
  created: s.string("Timestamp when the user was created, in ISO 8601 format."),
});

const organizationSchema = s.looseObject("A Codacy organization accessible to the user.", {
  identifier: s.integer("The Codacy organization identifier."),
  remoteIdentifier: s.string("The organization identifier on the Git provider."),
  name: s.nonEmptyString("The organization name."),
  provider: s.string("Git provider hosting the organization."),
  avatar: s.string("Organization avatar URL."),
  type: s.string("Codacy organization type."),
  singleProviderLogin: s.boolean("Whether the organization uses single provider login."),
  hasDastAccess: s.boolean("Whether the organization has DAST access."),
  hasScaEnabled: s.boolean("Whether the organization has SCA enabled."),
  imageSbomEnabled: s.boolean("Whether the organization has image SBOM enabled."),
});

const repositorySchema = s.looseObject("A Codacy repository summary.", {
  repositoryId: s.integer("The Codacy repository identifier."),
  provider: s.string("Git provider hosting the repository."),
  owner: s.string("Name of the organization that owns the repository."),
  name: s.nonEmptyString("Name of the repository."),
  fullPath: s.string("Full path of the repository on the Git provider."),
  visibility: s.string("Repository visibility reported by Codacy."),
  remoteIdentifier: s.string("Unique repository identifier on the Git provider."),
  languages: s.array(
    "Programming languages detected in the repository.",
    s.string("A programming language detected in the repository."),
  ),
});

const repositoryAnalysisSchema = s.looseObject("Repository analysis information returned by Codacy.", {
  repository: repositorySchema,
  grade: s.integer("Repository quality grade as a number between 0 and 100."),
  gradeLetter: s.string("Repository quality grade letter."),
  issuesPercentage: s.integer("Issue percentage reported by Codacy."),
  issuesCount: s.integer("Number of issues reported by Codacy."),
  loc: s.integer("Lines of code in the repository."),
  complexFilesPercentage: s.integer("Complex files percentage reported by Codacy."),
  complexFilesCount: s.integer("Number of complex files reported by Codacy."),
  duplicationPercentage: s.integer("Duplication percentage reported by Codacy."),
});

const toolSchema = s.looseObject("A Codacy code analysis tool.", {
  uuid: s.string("The tool unique identifier."),
  name: s.nonEmptyString("The tool name."),
  version: s.string("Original tool version used by the Codacy wrapper."),
  shortName: s.string("Unique short name of the tool."),
  documentationUrl: s.string("Original tool documentation URL."),
  sourceCodeUrl: s.string("Codacy tool wrapper source code URL."),
  prefix: s.string("Tool prefix used to ensure pattern names are unique."),
  needsCompilation: s.boolean("Whether the tool requires compilation to run."),
  configurationFilenames: s.array(
    "Configuration file names supported by the tool.",
    s.string("A configuration file name supported by the tool."),
  ),
  description: s.string("Tool description."),
  dockerImage: s.string("Docker image used to launch the tool."),
  languages: s.array(
    "Programming languages supported by the tool.",
    s.string("A programming language supported by the tool."),
  ),
  clientSide: s.boolean("Whether the tool is expected to run on the client machine."),
  standalone: s.boolean("Whether the client-side tool runs standalone outside the CLI."),
  enabledByDefault: s.boolean("Whether the tool is enabled by default for new projects."),
  configurable: s.boolean("Whether the tool is configurable in Codacy."),
});

const languageSchema = s.looseObject("A programming language supported by Codacy tools.", {
  name: s.nonEmptyString("The language name."),
  fileExtensions: s.array(
    "Default file extensions for this language.",
    s.string("A file extension for this language."),
  ),
  files: s.array(
    "Specific files that should be considered for this language.",
    s.string("A specific file name for this language."),
  ),
});

const patternSchema = s.looseObject("A Codacy code pattern that a tool can use to find issues.", {
  id: s.nonEmptyString("Pattern identifier unique per tool."),
  title: s.string("Pattern title."),
  category: s.string("Pattern category."),
  subCategory: s.string("Pattern subcategory."),
  level: s.string("Deprecated severity field returned by Codacy."),
  severityLevel: s.string("Pattern severity level."),
  description: s.string("Short description of the code pattern."),
  explanation: s.string("Full description of the code pattern in CommonMark."),
  enabled: s.boolean("Whether the pattern is enabled by default for new repositories."),
  languages: s.array(
    "Programming languages supported by the pattern.",
    s.string("A programming language supported by the pattern."),
  ),
  timeToFix: s.integer("Average time to fix an issue detected by the pattern, in minutes."),
  parameters: s.unknown("Pattern parameters returned by Codacy."),
  rationale: s.string("Rationale for the pattern."),
  solution: s.string("Suggested solution for the pattern."),
  goodExamples: s.array("Good examples for the pattern.", s.string("A good example.")),
  badExamples: s.array("Bad examples for the pattern.", s.string("A bad example.")),
  tags: s.array("Tags associated with the pattern.", s.string("A pattern tag.")),
});

const paginationInputSchema = s.object(
  "Input parameters for a paginated Codacy request.",
  {
    cursor: cursorField,
    limit: limitField,
  },
  { optional: ["cursor", "limit"] },
);

const providerPaginationInputSchema = s.object(
  "Input parameters for listing Codacy resources for one Git provider.",
  {
    provider: providerField,
    cursor: cursorField,
    limit: limitField,
  },
  { optional: ["provider", "cursor", "limit"] },
);

const repositoryScopeInputSchema = s.object(
  "Input parameters for a Codacy repository-scoped request.",
  {
    provider: providerField,
    remoteOrganizationName: remoteOrganizationNameField,
    repositoryName: repositoryNameField,
    branch: s.nonEmptyString("Name of a repository branch enabled on Codacy."),
  },
  { optional: ["branch"] },
);

const listRepositoryAnalysesInputSchema = s.object(
  "Input parameters for listing Codacy repository analysis results in one organization.",
  {
    provider: providerField,
    remoteOrganizationName: remoteOrganizationNameField,
    cursor: cursorField,
    limit: limitField,
    search: s.nonEmptyString("Search string used to filter repositories."),
    segments: s.nonEmptyString("Comma-separated list of segment identifiers."),
  },
  { optional: ["cursor", "limit", "search", "segments"] },
);

const listToolPatternsInputSchema = s.object(
  "Input parameters for listing Codacy patterns for one tool.",
  {
    toolUuid: toolUuidField,
    cursor: cursorField,
    limit: limitField,
    enabled: s.boolean("Filter by enabled status."),
  },
  { optional: ["cursor", "limit", "enabled"] },
);

const getToolPatternInputSchema = s.object(
  "Input parameters for retrieving one Codacy tool pattern.",
  {
    toolUuid: toolUuidField,
    patternId: patternIdField,
  },
  { required: ["toolUuid", "patternId"] },
);

export const codacyActions: readonly ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_current_user",
    description: "Retrieve the Codacy user associated with the connected API token.",
    inputSchema: s.object("Input parameters for retrieving the current Codacy user.", {}),
    outputSchema: s.object("The authenticated Codacy user.", {
      user: userSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_user_organizations",
    description:
      "List Codacy organizations accessible to the connected API token, optionally scoped to one Git provider.",
    inputSchema: providerPaginationInputSchema,
    outputSchema: s.object("Paginated Codacy organization list.", {
      organizations: s.array("Organizations accessible to the user.", organizationSchema),
      pagination: s.nullable(paginationSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "list_repository_analyses",
    description: "List repository analysis summaries for a Codacy organization on a Git provider.",
    inputSchema: listRepositoryAnalysesInputSchema,
    outputSchema: s.object("Paginated Codacy repository analysis list.", {
      repositories: s.array("Repository analysis summaries returned by Codacy.", repositoryAnalysisSchema),
      pagination: s.nullable(paginationSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "get_repository_analysis",
    description: "Retrieve one Codacy repository analysis summary.",
    inputSchema: repositoryScopeInputSchema,
    outputSchema: s.object("Codacy repository analysis response.", {
      repository: repositoryAnalysisSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_tools",
    description: "List Codacy code analysis tools.",
    inputSchema: paginationInputSchema,
    outputSchema: s.object("Paginated Codacy tool list.", {
      tools: s.array("Codacy tools returned by the API.", toolSchema),
      pagination: s.nullable(paginationSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "list_languages",
    description: "List programming languages supported by Codacy analysis tools.",
    inputSchema: s.object("Input parameters for listing Codacy-supported languages.", {}),
    outputSchema: s.object("Codacy-supported language list.", {
      languages: s.array("Programming languages supported by Codacy tools.", languageSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "list_tool_patterns",
    description: "List code patterns available for a Codacy analysis tool.",
    inputSchema: listToolPatternsInputSchema,
    outputSchema: s.object("Paginated Codacy tool pattern list.", {
      patterns: s.array("Patterns returned for the requested Codacy tool.", patternSchema),
      pagination: s.nullable(paginationSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "get_tool_pattern",
    description: "Retrieve one code pattern for a Codacy analysis tool.",
    inputSchema: getToolPatternInputSchema,
    outputSchema: s.object("Codacy tool pattern response.", {
      pattern: patternSchema,
    }),
  }),
];
