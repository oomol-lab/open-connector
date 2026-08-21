import type { ProviderActionDefinition } from "../../core/provider-definition.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "bluesky" as const;

export const blueskyPostTextMaxBytes = 3000;
export const blueskyPostTextMaxGraphemes = 300;

const textEncoder = new TextEncoder();
const graphemeSegmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });

const atIdentifierSchema = s.string("A Bluesky handle or DID.", { minLength: 1 });
const cursorSchema = s.string("A cursor returned by Bluesky pagination.", { minLength: 1 });
const postUriSchema = s.string("A Bluesky AT URI for a post or record.", { minLength: 1 });
const cidSchema = s.string("A Bluesky content identifier.", { minLength: 1 });
const compactRecordSchema = s.looseObject("The raw Bluesky object returned by the API.");
const postTextSchema = s.string("The primary post text.", {
  minLength: 1,
  maxLength: blueskyPostTextMaxBytes,
});

const profileSchema = s.looseObject("The detailed Bluesky profile object returned by the API.", {
  did: s.string("The decentralized identifier for the actor."),
  handle: s.string("The current handle for the actor."),
  displayName: s.string("The display name for the actor."),
  description: s.string("The profile description for the actor."),
  avatar: s.url("The actor avatar URL."),
  banner: s.url("The actor banner URL."),
  followersCount: s.integer("The number of followers for the actor."),
  followsCount: s.integer("The number of accounts followed by the actor."),
  postsCount: s.integer("The number of posts by the actor."),
});

const postViewSchema = s.looseObject("The raw Bluesky post view returned by a feed or search.", {
  uri: postUriSchema,
  cid: cidSchema,
  author: s.looseObject("The Bluesky author view for the post."),
  record: compactRecordSchema,
  indexedAt: s.string("The server timestamp when the post was indexed."),
});

const feedViewPostSchema = s.object(
  "A Bluesky timeline feed item containing a post and optional reply or repost context.",
  {
    post: postViewSchema,
    reply: compactRecordSchema,
    reason: compactRecordSchema,
    feedContext: s.string("Opaque feed-specific context returned by Bluesky."),
  },
  { required: ["post"], optional: ["reply", "reason", "feedContext"] },
);

const strongRefSchema = s.object("A Bluesky strong reference to a post.", {
  uri: postUriSchema,
  cid: cidSchema,
});

const textFacetSchema = s.looseObject("A Bluesky rich text facet object.");
const selfLabelsSchema = s.looseObject("A Bluesky self-label object.");

export const blueskyActions: ProviderActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_profile",
    description: "Get the detailed Bluesky profile for a handle or DID.",
    requiredScopes: [],
    inputSchema: s.object("Parameters for retrieving a Bluesky profile.", {
      actor: atIdentifierSchema,
    }),
    outputSchema: s.object("The Bluesky profile response.", {
      profile: profileSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "search_posts",
    description: "Search Bluesky posts with common filters and pagination.",
    requiredScopes: [],
    inputSchema: s.object(
      "Parameters for searching Bluesky posts.",
      {
        q: s.string("The Bluesky search query string.", { minLength: 1 }),
        sort: s.stringEnum("The ranking order for matching posts.", ["top", "latest"]),
        since: s.string("Return posts after this ISO date or datetime.", { minLength: 1 }),
        until: s.string("Return posts before this ISO date or datetime.", { minLength: 1 }),
        mentions: atIdentifierSchema,
        author: atIdentifierSchema,
        lang: s.string("Filter posts by language code.", { minLength: 1 }),
        domain: s.string("Filter posts by linked hostname.", { minLength: 1 }),
        url: s.url("Filter posts by linked URL."),
        tag: s.array(
          "Filter posts by hashtag values without the hash prefix.",
          s.string("A hashtag value.", { minLength: 1, maxLength: 640 }),
        ),
        limit: s.integer("The maximum number of posts to return.", { minimum: 1, maximum: 100 }),
        cursor: cursorSchema,
      },
      {
        optional: ["sort", "since", "until", "mentions", "author", "lang", "domain", "url", "tag", "limit", "cursor"],
      },
    ),
    outputSchema: s.object("The Bluesky search response.", {
      posts: s.array("Posts returned by Bluesky.", postViewSchema),
      cursor: s.nullable(cursorSchema),
      hitsTotal: s.nullable(s.integer("The total hit count when returned by Bluesky.")),
    }),
  }),
  defineProviderAction(service, {
    name: "get_timeline",
    description: "Get the authenticated account's home timeline with cursor pagination.",
    requiredScopes: [],
    inputSchema: s.object(
      "Parameters for retrieving the authenticated Bluesky timeline.",
      {
        algorithm: s.string("Optional Bluesky feed algorithm identifier.", { minLength: 1 }),
        limit: s.integer("The maximum number of posts to return.", { minimum: 1, maximum: 100 }),
        cursor: cursorSchema,
      },
      { optional: ["algorithm", "limit", "cursor"] },
    ),
    outputSchema: s.object("The authenticated Bluesky timeline response.", {
      feed: s.array("Timeline feed items returned by Bluesky.", feedViewPostSchema),
      cursor: s.nullable(cursorSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "create_text_post",
    description: "Create a Bluesky text post in the authenticated account's repository.",
    requiredScopes: [],
    inputSchema: s.object(
      "Fields for creating a Bluesky text post.",
      {
        text: postTextSchema,
        createdAt: s.dateTime("Client-declared timestamp for the post."),
        langs: s.array("Human language codes for the post text.", s.string("A language code.", { minLength: 1 }), {
          maxItems: 3,
        }),
        tags: s.array(
          "Additional hashtag values without the hash prefix.",
          s.string("A hashtag value.", { minLength: 1, maxLength: 640 }),
          { maxItems: 8 },
        ),
        facets: s.array("Rich text facets to attach to the post.", textFacetSchema),
        reply: s.object("Reply references for creating a reply post.", {
          root: strongRefSchema,
          parent: strongRefSchema,
        }),
        labels: selfLabelsSchema,
      },
      { optional: ["createdAt", "langs", "tags", "facets", "reply", "labels"] },
    ),
    outputSchema: s.object("The Bluesky record creation response.", {
      uri: postUriSchema,
      cid: cidSchema,
      validationStatus: s.nullable(s.string("The validation status returned by Bluesky.")),
      commit: s.nullable(compactRecordSchema),
    }),
  }),
];

export const blueskyActionByName: ReadonlyMap<string, ProviderActionDefinition> = new Map(
  blueskyActions.map((action) => [action.name, action] as const),
);

export function getBlueskyPostTextValidationIssues(text: string): string[] {
  const issues: string[] = [];
  if (textEncoder.encode(text).byteLength > blueskyPostTextMaxBytes) {
    issues.push(`text must be at most ${blueskyPostTextMaxBytes} UTF-8 bytes`);
  }

  if (Array.from(graphemeSegmenter.segment(text)).length > blueskyPostTextMaxGraphemes) {
    issues.push(`text must be at most ${blueskyPostTextMaxGraphemes} grapheme clusters`);
  }

  return issues;
}
