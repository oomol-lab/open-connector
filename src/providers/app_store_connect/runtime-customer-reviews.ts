import type { AppStoreConnectHandlers } from "./runtime-helpers.ts";

import { rawStringOrNull, booleanString, pickOptionalString } from "../../core/cast.ts";
import { ProviderRequestError } from "../provider-runtime.ts";
import { requiredInputString } from "../provider-runtime.ts";
import {
  deleteResource,
  indexIncludedResources,
  listResources,
  normalizeResource,
  readAppStoreConnectId,
  readIncludedResource,
  readIntegerQuery,
  readResource,
  requestAppStoreConnect,
  resourcePath,
  toOneLinkage,
} from "./runtime-helpers.ts";

export const appStoreConnectCustomerReviewHandlers: AppStoreConnectHandlers = {
  async list_customer_reviews(input, context) {
    const page = await listResources(context, input, {
      path: resourcePath("/v1/apps", readAppStoreConnectId(input.appId, "appId"), "customerReviews"),
      label: "App Store Connect customer review list",
      query: {
        "filter[rating]": readIntegerQuery(input.rating),
        "filter[territory]": pickOptionalString(input, "territory"),
        "exists[publishedResponse]": booleanString(input.hasResponse),
        "sort": pickOptionalString(input, "sort"),
        "include": "response",
      },
    });
    return {
      customerReviews: page.resources.map((resource) => ({
        ...normalizeResource(resource, "App Store Connect customer review"),
        response: readReviewResponseSummary(readIncludedResource(resource, "response", page.included)),
      })),
      nextCursor: page.nextCursor,
      total: page.total,
    };
  },

  async get_customer_review(input, context) {
    const { payload } = await requestAppStoreConnect(context, {
      path: resourcePath("/v1/customerReviews", readAppStoreConnectId(input.customerReviewId, "customerReviewId")),
      query: { include: "response" },
    });
    const resource = readResource(payload, "App Store Connect customer review");
    return {
      customerReview: {
        ...normalizeResource(resource, "App Store Connect customer review"),
        response: readReviewResponseSummary(
          readIncludedResource(resource, "response", indexIncludedResources(payload)),
        ),
      },
    };
  },

  async respond_to_customer_review(input, context) {
    const { payload } = await requestAppStoreConnect(context, {
      method: "POST",
      path: "/v1/customerReviewResponses",
      body: {
        data: {
          type: "customerReviewResponses",
          attributes: { responseBody: requiredInputString(input.responseBody, "responseBody") },
          relationships: {
            review: toOneLinkage("customerReviews", readAppStoreConnectId(input.customerReviewId, "customerReviewId")),
          },
        },
      },
    });
    const customerReviewResponse = readReviewResponseSummary(
      readResource(payload, "App Store Connect customer review response"),
    );
    if (!customerReviewResponse) {
      throw new ProviderRequestError(502, "App Store Connect did not return the created customer review response");
    }

    return { customerReviewResponse };
  },

  async delete_customer_review_response(input, context) {
    const customerReviewResponseId = readAppStoreConnectId(input.customerReviewResponseId, "customerReviewResponseId");
    await deleteResource(
      context,
      resourcePath("/v1/customerReviewResponses", customerReviewResponseId),
      "Removing the App Store Connect customer review response",
    );
    return { id: customerReviewResponseId, deleted: true };
  },
};

function readReviewResponseSummary(resource: Record<string, unknown> | undefined): Record<string, unknown> | null {
  if (!resource) {
    return null;
  }

  const response = normalizeResource(resource, "App Store Connect customer review response");
  return {
    id: response.id,
    responseBody: rawStringOrNull(response.responseBody),
    lastModifiedDate: rawStringOrNull(response.lastModifiedDate),
    state: rawStringOrNull(response.state),
  };
}
