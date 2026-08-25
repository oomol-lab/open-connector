import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "zhihu";

function defineZhihuAction<const TName extends string>(input: {
  name: TName;
  description: string;
  inputSchema: Record<string, unknown>;
  outputSchema: Record<string, unknown>;
  asyncLifecycle?: ActionDefinition["asyncLifecycle"];
}) {
  return defineProviderAction(service, {
    requiredScopes: [],
    ...input,
  });
}

const queryField = s.nonEmptyString("The search query keyword.");
const countField = (description: string, maximum: number) => s.integer(description, { minimum: 1, maximum });

const apiResponse = (description: string, data: Record<string, unknown>) =>
  s.looseObject(description, {
    Code: s.integer("The upstream response code."),
    Message: s.string("The upstream response message."),
    Data: s.looseObject("The response data.", data),
  });

const pagingSchema = s.looseObject("Pagination information returned by Zhihu.", {
  IsEnd: s.boolean("Whether this is the last page."),
  NextOffset: s.string("The opaque offset for the next page."),
  Totals: s.integer("The total number of records."),
});

const userContentSchema = s.looseObject("A Zhihu user content item.", {
  ContentType: s.string("The content type."),
  Url: s.url("The content URL."),
  CreatedAt: s.integer("The creation Unix timestamp in seconds."),
  LikeCount: s.integer("The number of likes."),
  CommentCount: s.integer("The number of comments."),
  FavoriteCount: s.integer("The number of favorites."),
  Title: s.string("The content title."),
  Summary: s.string("The content summary."),
});

const collectionContentSchema = s.looseObject("A Zhihu collection content item.", {
  FavTime: s.integer("The favorite Unix timestamp in seconds."),
  Favlists: s.array("The collections containing this item.", s.looseObject("A collection reference.")),
  Author: s.looseObject("The content author when available."),
});

const taskDataSchema = s.looseObject("The current asynchronous task state.", {
  task_id: s.string("The task identifier."),
  task_status: s.stringEnum("The task status.", ["pending", "running", "succeeded", "failed"]),
  progress: s.number("The task progress from zero to one."),
  result: s.nullable(s.looseObject("The completed task result.")),
  error: s.nullable(s.looseObject("The task error when failed.")),
});

const commentInfoSchema = s.looseObject("A selected comment returned with a content item.", {
  Content: s.string("The comment content."),
});

const searchItemSchema = s.looseObject("A Zhihu content search result item.", {
  Title: s.string("The content title."),
  ContentType: s.string("The content type, such as Answer or Article."),
  ContentID: s.string("The content identifier."),
  ContentText: s.string("The content excerpt. Highlighted fragments may include em tags."),
  Url: s.url("The source URL with Zhihu Open Platform attribution parameters."),
  CommentCount: s.integer("The number of comments."),
  VoteUpCount: s.integer("The number of upvotes."),
  AuthorName: s.string("The author display name."),
  AuthorAvatar: s.string("The author avatar URL."),
  AuthorBadge: s.string("The author certification badge image URL."),
  AuthorBadgeText: s.string("The author certification badge text."),
  EditTime: s.integer("The published or last edited Unix timestamp in seconds."),
  CommentInfoList: s.array("Selected comments returned for this content item.", commentInfoSchema),
  AuthorityLevel: s.string("The content authority level from 1 to 4."),
  RankingScore: s.number("The ranking score returned by Zhihu Search."),
});

const hotListItemSchema = s.looseObject("A Zhihu hot list item.", {
  Title: s.string("The hot list title."),
  Url: s.url("The Zhihu URL for the hot list item."),
  ThumbnailUrl: s.string("The thumbnail image URL, or an empty string when no image is available."),
  Summary: s.string("The item summary, or an empty string when no summary is available."),
});

const zhidaMessageSchema = s.object("A message in a Zhida chat completion request.", {
  role: s.stringEnum("The message role.", ["system", "user", "assistant"]),
  content: s.nonEmptyString("The message content."),
});

const zhidaChoiceSchema = s.looseObject("A Zhida completion choice.", {
  index: s.integer("The choice index."),
  message: s.looseObject("The assistant message returned by Zhida.", {
    role: s.string("The returned message role."),
    reasoning_content: s.string("The model reasoning content when returned."),
    content: s.string("The final answer content."),
  }),
  finish_reason: s.string("The reason the choice finished."),
});

const zhihuSearchAction = defineZhihuAction({
  name: "zhihu_search",
  description: "Search Zhihu content and return matching questions, answers, and articles.",
  inputSchema: s.object(
    "Input parameters for a Zhihu site search request.",
    {
      query: queryField,
      count: countField("The number of Zhihu search results to return, up to 10.", 10),
    },
    { optional: ["count"] },
  ),
  outputSchema: s.looseObject("A Zhihu site search response.", {
    Code: s.integer("The upstream response code."),
    Message: s.string("The upstream response message."),
    Data: s.looseObject("The Zhihu site search response data.", {
      HasMore: s.boolean("Whether more results are available. Zhihu currently returns false."),
      SearchHashId: s.string("The search request identifier."),
      Items: s.array("Search result items.", searchItemSchema),
      EmptyReason: s.string("The reason returned when the result set is empty."),
    }),
  }),
});

const globalSearchAction = defineZhihuAction({
  name: "global_search",
  description: "Search the global web index exposed by Zhihu Open Platform.",
  inputSchema: s.object(
    "Input parameters for a Zhihu global search request.",
    {
      query: queryField,
      count: countField("The number of global search results to return, up to 20.", 20),
      filter: s.nonEmptyString("Advanced filter expression for host or publish_time constraints."),
      searchDB: s.stringEnum("The search index database to query.", ["all", "realtime", "static"]),
    },
    { optional: ["count", "filter", "searchDB"] },
  ),
  outputSchema: s.looseObject("A Zhihu global search response.", {
    Code: s.integer("The upstream response code."),
    Message: s.string("The upstream response message."),
    Data: s.looseObject("The Zhihu global search response data.", {
      HasMore: s.boolean("Whether more results are available."),
      Items: s.array("Search result items.", searchItemSchema),
    }),
  }),
});

const hotListAction = defineZhihuAction({
  name: "hot_list",
  description: "Get the current Zhihu hot list with titles, links, thumbnails, and summaries.",
  inputSchema: s.object(
    "Input parameters for a Zhihu hot list request.",
    {
      limit: countField("The number of hot list items to return, up to 30.", 30),
    },
    { optional: ["limit"] },
  ),
  outputSchema: s.looseObject("A Zhihu hot list response.", {
    Code: s.integer("The upstream response code."),
    Message: s.string("The upstream response message."),
    Data: s.looseObject("The Zhihu hot list response data.", {
      Total: s.integer("The number of returned hot list items."),
      Items: s.array("Hot list items.", hotListItemSchema),
    }),
  }),
});

const zhidaAction = defineZhihuAction({
  name: "zhida",
  description: "Create a non-streaming Zhihu Zhida chat completion.",
  inputSchema: s.object("Input parameters for a non-streaming Zhida chat completion request.", {
    model: s.stringEnum("The Zhida model tier.", ["zhida-fast-1p5", "zhida-thinking-1p5", "zhida-agent"]),
    messages: s.array("Conversation messages to send to Zhida.", zhidaMessageSchema, {
      minItems: 1,
    }),
  }),
  outputSchema: s.looseObject("A non-streaming Zhida chat completion response.", {
    id: s.string("The completion identifier."),
    object: s.string("The response object type."),
    created: s.integer("The creation Unix timestamp in seconds."),
    model: s.string("The model that produced the response."),
    choices: s.array("Completion choices.", zhidaChoiceSchema),
  }),
});

const userContentsAction = defineZhihuAction({
  name: "user_contents",
  description: "List the current Access Secret owner's public Zhihu creations.",
  inputSchema: s.object(
    "Filters and pagination for user creations.",
    {
      contentType: s.stringEnum("The content type to include.", [
        "all",
        "answer",
        "article",
        "zvideo",
        "pin",
        "question",
      ]),
      offset: s.integer("The pagination offset.", { minimum: 0 }),
      limit: countField("The number of items to return, up to 50.", 50),
      sortField: s.stringEnum("The field used to sort results.", ["like_count", "ts"]),
      sortOrder: s.stringEnum("The result sort direction.", ["asc", "desc"]),
    },
    { optional: ["offset", "limit", "sortField", "sortOrder"] },
  ),
  outputSchema: apiResponse("A user creations response.", {
    Items: s.array("User creation items.", userContentSchema),
    Paging: pagingSchema,
  }),
});

const userFolloweesAction = defineZhihuAction({
  name: "user_followees",
  description: "List the current Access Secret owner's public Zhihu followees.",
  inputSchema: s.object(
    "Pagination for the followee list.",
    {
      offset: s.integer("The pagination offset.", { minimum: 0 }),
      limit: countField("The number of followees to return, up to 50.", 50),
    },
    { optional: ["offset", "limit"] },
  ),
  outputSchema: apiResponse("A user followees response.", {
    Items: s.array("Followed users.", s.looseObject("A followed Zhihu user.")),
    Paging: pagingSchema,
  }),
});

const userCollectionsAction = defineZhihuAction({
  name: "user_collections",
  description: "List the current Access Secret owner's recently favorited public content.",
  inputSchema: s.object(
    "Options for recent favorites.",
    {
      limit: countField("The number of recent favorites to return, up to 50.", 50),
    },
    { optional: ["limit"] },
  ),
  outputSchema: apiResponse("A recent favorites response.", {
    Items: s.array("Recently favorited content.", collectionContentSchema),
  }),
});

const userFavlistsAction = defineZhihuAction({
  name: "user_favlists",
  description: "List the current Access Secret owner's public Zhihu collections.",
  inputSchema: s.object(
    "Options for listing collections.",
    {
      limit: countField("The number of collections to return, up to 50.", 50),
    },
    { optional: ["limit"] },
  ),
  outputSchema: apiResponse("A collections response.", {
    Items: s.array("Zhihu collections.", s.looseObject("A Zhihu collection.")),
  }),
});

const favlistContentsAction = defineZhihuAction({
  name: "favlist_contents",
  description: "List public content in one collection owned by the current Access Secret account.",
  inputSchema: s.object(
    "The collection identifier and pagination.",
    {
      favlistUrlToken: s.integer("The collection URL token."),
      offset: s.integer("The pagination offset.", { minimum: 0 }),
      limit: countField("The number of items to return, up to 50.", 50),
    },
    { optional: ["offset", "limit"] },
  ),
  outputSchema: apiResponse("A collection contents response.", {
    Items: s.array("Collection content items.", collectionContentSchema),
    Paging: pagingSchema,
  }),
});

const knowledgeBasesAction = defineZhihuAction({
  name: "knowledge_bases",
  description: "List Zhida knowledge bases created by or subscribed to by the current account.",
  inputSchema: s.object(
    "Knowledge base list filters.",
    {
      scope: s.stringEnum("The relationship used to filter knowledge bases.", ["all", "created", "subscribed"]),
    },
    { optional: ["scope"] },
  ),
  outputSchema: apiResponse("A knowledge base list response.", {
    Items: s.array("Knowledge bases.", s.looseObject("A Zhida knowledge base.")),
  }),
});

const knowledgeBaseItemsAction = defineZhihuAction({
  name: "knowledge_base_items",
  description: "List content in a Zhida knowledge base using cursor pagination.",
  inputSchema: s.object(
    "The knowledge base and page to retrieve.",
    {
      knowledgeBaseId: s.nonEmptyString("The knowledge base identifier."),
      cursor: s.string("The opaque cursor returned by the previous page."),
      limit: countField("The number of items to return, up to 20.", 20),
    },
    { optional: ["cursor", "limit"] },
  ),
  outputSchema: apiResponse("A knowledge base contents response.", {
    Items: s.array("Knowledge base content items.", s.looseObject("A knowledge base content item.")),
    Total: s.integer("The total number of content items."),
    HasMore: s.boolean("Whether another page is available."),
    NextCursor: s.string("The opaque cursor for the next page."),
  }),
});

const knowledgeSearchInputSchema = {
  description:
    "The query and knowledge recall ranges. Provide at least one non-empty knowledgeBaseIds or recallScopes array.",
  allOf: [
    s.object(
      "The knowledge retrieval query and optional recall ranges.",
      {
        query: s.nonEmptyString("The retrieval question."),
        knowledgeBaseIds: s.array(
          "Knowledge base identifiers to search. Required when recallScopes is omitted.",
          s.nonEmptyString("A knowledge base identifier."),
          { minItems: 1 },
        ),
        recallScopes: s.array(
          "Built-in recall scopes to search. Required when knowledgeBaseIds is omitted.",
          s.stringEnum("A recall scope.", ["personal", "subscription", "public"]),
          { minItems: 1 },
        ),
        limit: countField("The number of documents to return, up to 10.", 10),
      },
      { optional: ["knowledgeBaseIds", "recallScopes", "limit"] },
    ),
    s.anyOf(
      [
        {
          type: "object",
          required: ["knowledgeBaseIds"],
          description: "A request that searches explicit knowledge bases.",
        },
        { type: "object", required: ["recallScopes"], description: "A request that searches built-in recall scopes." },
      ],
      { description: "At least one knowledge retrieval range is required." },
    ),
  ],
};

const knowledgeSearchAction = defineZhihuAction({
  name: "knowledge_search",
  description: "Retrieve relevant document fragments from Zhida knowledge bases with RAG search.",
  inputSchema: knowledgeSearchInputSchema,
  outputSchema: apiResponse("A knowledge retrieval response.", {
    Items: s.array("Relevant documents and fragments.", s.looseObject("A knowledge retrieval result.")),
  }),
});

const knowledgeFileUploadAction = defineZhihuAction({
  name: "knowledge_file_upload",
  description: "Download a file from an HTTP URL and upload it into a Zhida knowledge base.",
  inputSchema: s.object(
    "The source file and optional target knowledge base.",
    {
      fileUrl: s.url("The HTTP or HTTPS URL whose file should be uploaded."),
      fileName: s.nonEmptyString("The file name, including a supported extension."),
      knowledgeBaseId: s.nonEmptyString("The target knowledge base identifier."),
    },
    { optional: ["knowledgeBaseId"] },
  ),
  outputSchema: apiResponse("A knowledge file upload response.", {
    KnowledgeBaseID: s.string("The knowledge base that received the file."),
    RecallContentID: s.string("The uploaded content identifier."),
    FileName: s.string("The normalized uploaded file name."),
    FileSize: s.integer("The uploaded file size in bytes."),
    Title: s.string("The parsed content title when available."),
    Abstract: s.string("The parsed content summary when available."),
    OriginUrl: s.string("The source file URL returned by Zhihu when available."),
  }),
});

const submitPdfParseAction = defineZhihuAction({
  name: "submit_pdf_parse",
  description: "Download a PDF from an HTTP URL, upload it to Zhihu, and submit an asynchronous parse task.",
  asyncLifecycle: { startActionId: "zhihu.submit_pdf_parse", statusActionId: "zhihu.get_pdf_parse" },
  inputSchema: s.object(
    "The source PDF and optional idempotency key.",
    {
      fileUrl: s.url("The HTTP or HTTPS URL of a PDF file up to 100 MB."),
      fileName: s.nonEmptyString("The PDF file name, ending in .pdf."),
      idempotencyKey: s.string("A key that makes repeated identical task submissions idempotent."),
    },
    { optional: ["idempotencyKey"] },
  ),
  outputSchema: apiResponse("A queued PDF parsing response.", {
    task_id: s.string("The PDF parsing task identifier."),
    task_status: s.string("The initial task status."),
  }),
});

const getPdfParseAction = defineZhihuAction({
  name: "get_pdf_parse",
  description: "Get the status and temporary result URL for a Zhihu PDF parsing task.",
  asyncLifecycle: { startActionId: "zhihu.submit_pdf_parse", statusActionId: "zhihu.get_pdf_parse" },
  inputSchema: s.object("The PDF parsing task to retrieve.", {
    taskId: s.nonEmptyString("The PDF parsing task identifier."),
  }),
  outputSchema: s.looseObject("A PDF parsing task response.", {
    Code: s.integer("The upstream response code."),
    Message: s.string("The upstream response message."),
    Data: taskDataSchema,
  }),
});

const submitPptGenerationAction = defineZhihuAction({
  name: "submit_ppt_generation",
  description: "Submit a Zhihu answer or article URL for asynchronous PPTX generation.",
  asyncLifecycle: { startActionId: "zhihu.submit_ppt_generation", statusActionId: "zhihu.get_ppt_generation" },
  inputSchema: s.object(
    "The source content and requested slide count.",
    {
      resourceUrl: s.url("A supported Zhihu answer or article URL."),
      numPages: s.integer("The requested number of slides, from 6 to 21.", {
        minimum: 6,
        maximum: 21,
      }),
      idempotencyKey: s.string("A key that makes repeated identical submissions idempotent."),
    },
    { optional: ["idempotencyKey"] },
  ),
  outputSchema: apiResponse("A queued PPT generation response.", {
    task_id: s.string("The PPT generation task identifier."),
    task_status: s.string("The initial task status."),
  }),
});

const getPptGenerationAction = defineZhihuAction({
  name: "get_ppt_generation",
  description: "Get the status and temporary PPTX download URL for a PPT generation task.",
  asyncLifecycle: { startActionId: "zhihu.submit_ppt_generation", statusActionId: "zhihu.get_ppt_generation" },
  inputSchema: s.object("The PPT generation task to retrieve.", {
    taskId: s.nonEmptyString("The PPT generation task identifier."),
  }),
  outputSchema: s.looseObject("A PPT generation task response.", {
    Code: s.integer("The upstream response code."),
    Message: s.string("The upstream response message."),
    Data: taskDataSchema,
  }),
});

export const zhihuActions: ActionDefinition[] = [
  zhihuSearchAction,
  globalSearchAction,
  hotListAction,
  zhidaAction,
  userContentsAction,
  userFolloweesAction,
  userCollectionsAction,
  userFavlistsAction,
  favlistContentsAction,
  knowledgeBasesAction,
  knowledgeBaseItemsAction,
  knowledgeSearchAction,
  knowledgeFileUploadAction,
  submitPdfParseAction,
  getPdfParseAction,
  submitPptGenerationAction,
  getPptGenerationAction,
];
