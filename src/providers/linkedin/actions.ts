import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "linkedin";

export type LinkedinActionName =
  | "get_current_member"
  | "create_text_post"
  | "delete_post"
  | "create_article_post"
  | "create_reshare";

export const linkedinOAuthScopes: string[] = ["openid", "profile", "email", "w_member_social"];

const rawObject = s.looseObject({}, { description: "The raw object returned by the LinkedIn API." });
const memberReadScopes = ["openid", "profile", "email"];
const postWriteScopes = ["w_member_social"];

const linkedInMember = s.object(
  "A normalized LinkedIn OpenID Connect member profile.",
  {
    sub: s.string("The LinkedIn subject identifier for the authenticated member."),
    name: s.string("The member's full display name."),
    givenName: s.string("The member's given name."),
    familyName: s.string("The member's family name."),
    email: s.email("The member's primary email address."),
    emailVerified: s.boolean("Whether LinkedIn reports the email address as verified."),
    locale: s.string("The member's locale."),
    picture: s.url("The member's profile picture URL."),
    raw: rawObject,
  },
  { optional: ["name", "givenName", "familyName", "email", "emailVerified", "locale", "picture"] },
);

const visibility = s.stringEnum(["PUBLIC", "CONNECTIONS", "LOGGED_IN", "CONTAINER"], {
  description: "Who can see the LinkedIn post.",
});

const memberAuthorUrn = s.string({
  minLength: 1,
  pattern: "^urn:li:person:.+",
  description: "The member author URN, such as urn:li:person:{personId}.",
});
const commentary = s.string({
  minLength: 1,
  maxLength: 3000,
  description: "The plain text commentary for the post.",
});
const postUrn = s.string({
  minLength: 1,
  description: "The raw LinkedIn post URN, such as urn:li:share:{id}.",
});

function output(properties: Record<string, JsonSchema>, description: string): JsonSchema {
  return s.object(properties, { required: Object.keys(properties), description });
}

function action(input: {
  name: LinkedinActionName;
  operationType: ActionDefinition["operationType"];
  description: string;
  requiredScopes: string[];
  inputSchema: JsonSchema;
  outputSchema: JsonSchema;
}): ActionDefinition {
  return defineProviderAction(service, {
    ...input,
    providerPermissions: input.requiredScopes,
  });
}

export const linkedinActions: ActionDefinition[] = [
  action({
    name: "get_current_member",
    operationType: "read",
    description: "Retrieve the authenticated LinkedIn member's OpenID Connect profile.",
    requiredScopes: memberReadScopes,
    inputSchema: s.object({}, { description: "No input is required to retrieve the current LinkedIn member." }),
    outputSchema: output({ member: linkedInMember }, "The current LinkedIn member profile."),
  }),
  action({
    name: "create_text_post",
    operationType: "write",
    description: "Create a text-only organic LinkedIn post for a member author.",
    requiredScopes: postWriteScopes,
    inputSchema: s.object(
      "Request parameters for creating a text-only LinkedIn post.",
      {
        authorUrn: memberAuthorUrn,
        commentary,
        visibility,
        disableReshare: s.boolean("Whether resharing should be disabled for the post."),
      },
      { required: ["authorUrn", "commentary"], optional: ["visibility", "disableReshare"] },
    ),
    outputSchema: output(
      {
        postUrn: s.string("The URN of the created LinkedIn post."),
        raw: rawObject,
      },
      "The created LinkedIn post identifier.",
    ),
  }),
  action({
    name: "delete_post",
    operationType: "destructive",
    description: "Delete a LinkedIn post by raw post URN using the Posts API.",
    requiredScopes: postWriteScopes,
    inputSchema: s.object("Request parameters for deleting a LinkedIn post.", { postUrn }, { required: ["postUrn"] }),
    outputSchema: output(
      {
        postUrn: s.string("The URN of the deleted LinkedIn post."),
        deleted: s.boolean("Whether the delete request completed successfully."),
        raw: rawObject,
      },
      "The deleted LinkedIn post identifier.",
    ),
  }),
  action({
    name: "create_article_post",
    operationType: "write",
    description: "Create a LinkedIn article or link post with explicit source URL metadata using the Posts API.",
    requiredScopes: postWriteScopes,
    inputSchema: s.object(
      "Request parameters for creating a LinkedIn article post.",
      {
        authorUrn: memberAuthorUrn,
        commentary,
        sourceUrl: s.url("The article or link URL to attach to the post."),
        title: s.nonEmptyString("The article title to send to LinkedIn."),
        description: s.nonEmptyString("The article description to send to LinkedIn."),
        thumbnailUrn: s.nonEmptyString("The LinkedIn image URN to use as the article thumbnail."),
        visibility,
        disableReshare: s.boolean("Whether resharing should be disabled for the post."),
      },
      {
        required: ["authorUrn", "commentary", "sourceUrl"],
        optional: ["title", "description", "thumbnailUrn", "visibility", "disableReshare"],
      },
    ),
    outputSchema: output(
      {
        postUrn: s.string("The URN of the created LinkedIn post."),
        raw: rawObject,
      },
      "The created LinkedIn article post identifier.",
    ),
  }),
  action({
    name: "create_reshare",
    operationType: "write",
    description: "Create a LinkedIn reshare of an existing post using the Posts API.",
    requiredScopes: postWriteScopes,
    inputSchema: s.object(
      "Request parameters for resharing a LinkedIn post.",
      {
        authorUrn: memberAuthorUrn,
        parentPostUrn: postUrn,
        commentary,
        visibility,
        disableReshare: s.boolean("Whether resharing should be disabled for the new post."),
      },
      {
        required: ["authorUrn", "parentPostUrn"],
        optional: ["commentary", "visibility", "disableReshare"],
      },
    ),
    outputSchema: output(
      {
        postUrn: s.string("The URN of the created LinkedIn reshare."),
        raw: rawObject,
      },
      "The created LinkedIn reshare identifier.",
    ),
  }),
];
