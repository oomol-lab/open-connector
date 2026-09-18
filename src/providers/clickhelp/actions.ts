import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "clickhelp";

export type ClickhelpActionName =
  | "list_projects"
  | "get_project"
  | "list_topics"
  | "get_topic"
  | "create_topic"
  | "update_topic"
  | "search_portal";

const nonEmptyString = (description: string) => s.nonEmptyString(description);
const contentFormat = s.stringEnum("The requested compiled topic content format.", ["html", "md"]);
const projectType = s.stringEnum("The project entity type to return.", ["Project", "Publication"]);

const projectSchema = s.looseRequiredObject("A ClickHelp project or publication.", {
  createdOn: s.string("The ISO 8601 creation timestamp."),
  fullUrl: s.string("The full project or publication URL."),
  id: s.string("The project or publication identifier."),
  parentId: s.nullable(s.string("The parent project identifier for a publication.")),
  title: s.string("The project or publication title."),
  visibility: s.string("The visibility returned by ClickHelp."),
  lang: s.string("The four-letter content language code."),
  baseLangProjectId: s.nullable(s.string("The base-language project identifier.")),
});

const topicSchema = s.looseRequiredObject("A ClickHelp topic.", {
  assigneeUserName: s.nullable(s.string("The topic assignee login.")),
  body: s.nullable(s.string("The topic body HTML when returned by the endpoint.")),
  compiledContent: s.nullable(s.string("The compiled topic content when requested.")),
  compiledContentType: s.nullable(contentFormat),
  createdOn: s.string("The ISO 8601 creation timestamp."),
  ftsSnippet: s.nullable(s.string("The highlighted full-text search snippet.")),
  ftsTitle: s.nullable(s.string("The highlighted full-text search title.")),
  fullUrl: s.string("The full topic URL."),
  id: s.string("The topic identifier."),
  indexKeywords: s.array("The topic index keywords.", s.string("An index keyword.")),
  modifiedOn: s.string("The ISO 8601 modification timestamp."),
  ownerUserName: s.nullable(s.string("The topic owner login.")),
  projectId: s.string("The containing project or publication identifier."),
  projectTitle: s.string("The containing project or publication title."),
  statusName: s.nullable(s.string("The topic workflow status.")),
  title: s.string("The topic title."),
  tocNodeId: s.string("The associated table-of-contents node identifier."),
  isAutoTopic: s.boolean("Whether the topic is generated from an API definition."),
});

const listProjects = defineProviderAction(service, {
  name: "list_projects",
  operationType: "read",
  description: "List ClickHelp projects and publications available to the connected user.",
  followUpActions: ["clickhelp.get_project"],
  inputSchema: s.object(
    "Filters for listing ClickHelp projects and publications.",
    {
      type: projectType,
      parentId: nonEmptyString("The parent project id used to filter publications."),
    },
    { optional: ["type", "parentId"] },
  ),
  outputSchema: s.requiredObject("The ClickHelp project and publication list.", {
    projects: s.array("The available projects and publications.", projectSchema),
  }),
});

const getProject = defineProviderAction(service, {
  name: "get_project",
  operationType: "read",
  description: "Get one ClickHelp project or publication by id.",
  followUpActions: ["clickhelp.list_topics"],
  inputSchema: s.requiredObject("The ClickHelp project lookup.", {
    projectId: nonEmptyString("The project or publication id."),
  }),
  outputSchema: s.requiredObject("The requested ClickHelp project or publication.", {
    project: projectSchema,
  }),
});

const listTopics = defineProviderAction(service, {
  name: "list_topics",
  operationType: "read",
  description: "List or search topics within one ClickHelp project or publication.",
  followUpActions: ["clickhelp.get_topic"],
  inputSchema: s.object(
    "Filters for listing topics in a ClickHelp project or publication.",
    {
      projectId: nonEmptyString("The project or publication id."),
      query: nonEmptyString("The optional full-text query."),
      returnSnippets: s.boolean("Whether search snippets should be returned with a query."),
      count: s.integer("The maximum number of results; a negative value returns all results."),
      format: contentFormat,
    },
    { optional: ["query", "returnSnippets", "count", "format"] },
  ),
  outputSchema: s.requiredObject("The topics in the project or publication.", {
    topics: s.array("The matching ClickHelp topics.", topicSchema),
  }),
});

const getTopic = defineProviderAction(service, {
  name: "get_topic",
  operationType: "read",
  description: "Get one ClickHelp topic, optionally compiling its content as HTML or Markdown.",
  inputSchema: s.object(
    "The ClickHelp topic lookup.",
    {
      projectId: nonEmptyString("The project or publication id."),
      topicId: nonEmptyString("The topic id."),
      format: contentFormat,
    },
    { optional: ["format"] },
  ),
  outputSchema: s.requiredObject("The requested ClickHelp topic.", {
    topic: topicSchema,
  }),
});

const createTopic = defineProviderAction(service, {
  name: "create_topic",
  operationType: "write",
  description: "Create a topic in a ClickHelp project using HTML body content and topic metadata.",
  followUpActions: ["clickhelp.get_topic"],
  inputSchema: s.object(
    "The ClickHelp topic to create.",
    {
      projectId: nonEmptyString("The project id."),
      topicId: nonEmptyString("The new topic id."),
      title: nonEmptyString("The topic title."),
      body: s.string("The topic body as HTML."),
      assigneeUserName: nonEmptyString("The topic assignee login."),
      ownerUserName: nonEmptyString("The topic owner login."),
      statusName: nonEmptyString("The topic workflow status."),
      showInToc: s.boolean("Whether the topic should be shown in publication tables of contents."),
      parentTocNodeId: nonEmptyString("The parent table-of-contents node id."),
      tocNodeCaption: nonEmptyString("The custom table-of-contents caption."),
      tocNodeOrdinalNo: s.integer("The topic position in the table of contents."),
      indexKeywords: s.array("The topic index keywords.", nonEmptyString("An index keyword.")),
    },
    {
      optional: [
        "title",
        "body",
        "assigneeUserName",
        "ownerUserName",
        "statusName",
        "showInToc",
        "parentTocNodeId",
        "tocNodeCaption",
        "tocNodeOrdinalNo",
        "indexKeywords",
      ],
    },
  ),
  outputSchema: s.requiredObject("The created ClickHelp topic.", {
    topic: topicSchema,
  }),
});

const updateTopic = defineProviderAction(service, {
  name: "update_topic",
  operationType: "write",
  description: "Update selected content or metadata fields on a ClickHelp topic.",
  inputSchema: s.object(
    "The ClickHelp topic fields to update.",
    {
      projectId: nonEmptyString("The project id."),
      topicId: nonEmptyString("The topic id."),
      title: nonEmptyString("The updated topic title."),
      body: s.string("The updated topic body as HTML."),
      assigneeUserName: nonEmptyString("The updated topic assignee login."),
      ownerUserName: nonEmptyString("The updated topic owner login."),
      statusName: nonEmptyString("The updated topic workflow status."),
      indexKeywords: s.array("The updated topic index keywords.", nonEmptyString("An index keyword.")),
    },
    {
      optional: ["title", "body", "assigneeUserName", "ownerUserName", "statusName", "indexKeywords"],
    },
  ),
  outputSchema: s.requiredObject("The updated ClickHelp topic.", {
    topic: topicSchema,
  }),
});

const searchPortal = defineProviderAction(service, {
  name: "search_portal",
  operationType: "read",
  description: "Search full text across ClickHelp projects and publications available to the user.",
  followUpActions: ["clickhelp.get_topic"],
  inputSchema: s.object(
    "The ClickHelp portal search query.",
    {
      query: nonEmptyString("The full-text search query, including supported search operators."),
      count: s.integer("The maximum number of results; a negative value returns all results."),
      projectIds: s.array("The project or publication ids to search.", nonEmptyString("A project or publication id.")),
      language: nonEmptyString("The four-letter language code used to filter results."),
      returnSnippets: s.boolean("Whether highlighted title and content snippets should be returned."),
      format: contentFormat,
    },
    { optional: ["count", "projectIds", "language", "returnSnippets", "format"] },
  ),
  outputSchema: s.requiredObject("The ClickHelp portal search response.", {
    topics: s.array("The matching ClickHelp topics.", topicSchema),
  }),
});

export const clickhelpActions: ActionDefinition[] = [
  listProjects,
  getProject,
  listTopics,
  getTopic,
  createTopic,
  updateTopic,
  searchPortal,
];
