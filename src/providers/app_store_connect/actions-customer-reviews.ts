import type { ProviderActionDefinition } from "../../core/provider-definition.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";
import { service } from "./schemas.ts";
import {
  customerReviewResource,
  deletedOutput,
  nonEmptyString,
  pageOutput,
  paginationInputs,
  respondToReviewsRoles,
  reviewResponseFields,
  viewReviewsRoles,
} from "./schemas.ts";

export const appStoreConnectCustomerReviewActions: readonly ProviderActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_customer_reviews",
    operationType: "read",
    description:
      "List the App Store reviews of one app together with the developer response published for each review.",
    requiredScopes: [],
    providerPermissions: [...viewReviewsRoles],
    inputSchema: s.object(
      "Filters for browsing the reviews of one app.",
      {
        appId: nonEmptyString("App Store Connect identifier of the app."),
        rating: s.integer("Return only reviews with this star rating.", { minimum: 1, maximum: 5 }),
        territory: s.nonEmptyString(
          "Return only reviews written in this storefront, as an ISO 3166-1 alpha-3 code such as USA or DEU.",
          { pattern: "^[A-Z]{3}$" },
        ),
        hasResponse: s.boolean("Return only reviews that already have a developer response, or only those without."),
        sort: s.stringEnum("Sort order for the returned reviews.", [
          "rating",
          "-rating",
          "createdDate",
          "-createdDate",
        ]),
        ...paginationInputs,
      },
      { required: ["appId"] },
    ),
    outputSchema: pageOutput(
      "customerReviews",
      customerReviewResource,
      "Reviews returned for this page.",
      "A page of App Store reviews.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_customer_review",
    operationType: "read",
    description: "Read one App Store review together with the developer response published for it.",
    requiredScopes: [],
    providerPermissions: [...viewReviewsRoles],
    inputSchema: s.actionInput(
      { customerReviewId: nonEmptyString("App Store Connect identifier of the review.") },
      ["customerReviewId"],
      "Identifies the review to read.",
    ),
    outputSchema: s.actionOutput({ customerReview: customerReviewResource }, "The requested App Store review."),
  }),
  defineProviderAction(service, {
    name: "respond_to_customer_review",
    operationType: "destructive",
    description:
      "Publish a developer response to an App Store review. App Store Connect treats this as an upsert: an existing response for the same review is replaced, and publication is asynchronous.",
    requiredScopes: [],
    providerPermissions: [...respondToReviewsRoles],
    inputSchema: s.object(
      "The response to publish for one review.",
      {
        customerReviewId: nonEmptyString("App Store Connect identifier of the review to respond to."),
        responseBody: nonEmptyString("Text of the developer response."),
      },
      { required: ["customerReviewId", "responseBody"] },
    ),
    outputSchema: s.actionOutput(
      {
        customerReviewResponse: s.object("The stored developer response.", reviewResponseFields, {
          additionalProperties: true,
          required: ["id"],
        }),
      },
      "The published or updated developer response.",
    ),
  }),
  defineProviderAction(service, {
    name: "delete_customer_review_response",
    operationType: "destructive",
    description: "Remove a published developer response from an App Store review.",
    requiredScopes: [],
    providerPermissions: [...respondToReviewsRoles],
    inputSchema: s.actionInput(
      {
        customerReviewResponseId: nonEmptyString("App Store Connect identifier of the developer response."),
      },
      ["customerReviewResponseId"],
      "Identifies the developer response to remove.",
    ),
    outputSchema: s.actionOutput(
      deletedOutput("App Store Connect identifier of the removed developer response."),
      "Confirmation that the developer response was removed.",
    ),
  }),
];
