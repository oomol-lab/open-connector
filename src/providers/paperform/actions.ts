import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "paperform";

const rawObjectSchema = s.looseObject("The raw Paperform API object for advanced fields.");
const submissionDataSchema = s.record(
  "Submission answers keyed by Paperform field key.",
  s.unknown("A submitted answer value returned by Paperform."),
);

const sortSchema = s.stringEnum("The direction used by Paperform to sort by created_at.", ["ASC", "DESC"]);

const paginationInputFields = {
  limit: s.integer("The number of results to return.", { minimum: 1, maximum: 100 }),
  skip: s.integer("The number of results to skip in the result set.", { minimum: 0 }),
  after_id: s.nonEmptyString("Return results after this Paperform object ID."),
  before_id: s.nonEmptyString("Return results before this Paperform object ID."),
  before_date: s.dateTime(
    "Return results created on or after this UTC datetime. Paperform ignores this when before_id is provided.",
  ),
  after_date: s.dateTime(
    "Return results created before this UTC datetime. Paperform ignores this when after_id is provided.",
  ),
  sort: sortSchema,
};

const paginationOptionalKeys = ["limit", "skip", "after_id", "before_id", "before_date", "after_date", "sort"] as const;

const slugInputFields = {
  slug_or_id: s.nonEmptyString("The Paperform form slug, custom slug, or ID."),
};

const pageInfoSchema = s.object(
  "Pagination metadata returned by Paperform.",
  {
    total: s.nullableInteger("The total number of matching items when returned."),
    has_more: s.nullableBoolean("Whether Paperform has more matching items."),
    limit: s.nullableInteger("The result limit Paperform applied."),
    skip: s.nullableInteger("The result offset Paperform applied."),
  },
  { required: ["total", "has_more", "limit", "skip"] },
);

const formSchema = s.object(
  "A Paperform form.",
  {
    id: s.nullableString("The unique identifier of the form."),
    slug: s.nullableString("The default generated slug for the form."),
    custom_slug: s.nullableString("The custom slug for the form if one is set."),
    title: s.nullableString("The title of the form."),
    description: s.nullableString("The description of the form."),
    url: s.nullableString("The main sharing URL for the form."),
    live: s.nullableBoolean("Whether the form is currently accepting submissions."),
    submission_count: s.nullableInteger("The number of submissions the form has received."),
    created_at_utc: s.nullableString("The UTC datetime when the form was created."),
    updated_at_utc: s.nullableString("The UTC datetime when the form was updated."),
    raw: rawObjectSchema,
  },
  {
    required: [
      "id",
      "slug",
      "custom_slug",
      "title",
      "description",
      "url",
      "live",
      "submission_count",
      "created_at_utc",
      "updated_at_utc",
      "raw",
    ],
    additionalProperties: true,
  },
);

const fieldSchema = s.object(
  "A Paperform form field.",
  {
    key: s.nullableString("The unique key for this field."),
    title: s.nullableString("The title of this field."),
    description: s.nullableString("The description of this field."),
    type: s.nullableString("The Paperform field type."),
    required: s.nullableBoolean("Whether this field is required."),
    custom_key: s.nullableString("The custom key of this field."),
    placeholder: s.nullableString("The placeholder for this field."),
    raw: rawObjectSchema,
  },
  {
    required: ["key", "title", "description", "type", "required", "custom_key", "placeholder", "raw"],
    additionalProperties: true,
  },
);

const submissionSchema = s.object(
  "A Paperform submission.",
  {
    id: s.nullableString("The unique identifier of the submission."),
    form_id: s.nullableString("The ID of the Paperform form for this submission."),
    data: submissionDataSchema,
    created_at: s.nullableString("The account-timezone datetime when the submission was created."),
    created_at_utc: s.nullableString("The UTC datetime when the submission was created."),
    account_timezone: s.nullableString("The Paperform account timezone for this submission."),
    raw: rawObjectSchema,
  },
  {
    required: ["id", "form_id", "data", "created_at", "created_at_utc", "account_timezone", "raw"],
    additionalProperties: true,
  },
);

const partialSubmissionSchema = s.object(
  "A Paperform partial submission.",
  {
    id: s.nullableString("The unique identifier of the partial submission."),
    form_id: s.nullableString("The ID of the Paperform form for this partial submission."),
    data: submissionDataSchema,
    last_answered: s.nullableString("The last answered field key when returned by Paperform."),
    submitted_at: s.nullableString("The account-timezone datetime when the partial submission was submitted."),
    updated_at: s.nullableString("The account-timezone datetime when the partial submission was updated."),
    created_at: s.nullableString("The account-timezone datetime when the partial submission was created."),
    submitted_at_utc: s.nullableString("The UTC datetime when the partial submission was submitted."),
    created_at_utc: s.nullableString("The UTC datetime when the partial submission was created."),
    updated_at_utc: s.nullableString("The UTC datetime when the partial submission was updated."),
    account_timezone: s.nullableString("The Paperform account timezone for this partial submission."),
    raw: rawObjectSchema,
  },
  {
    required: [
      "id",
      "form_id",
      "data",
      "last_answered",
      "submitted_at",
      "updated_at",
      "created_at",
      "submitted_at_utc",
      "created_at_utc",
      "updated_at_utc",
      "account_timezone",
      "raw",
    ],
    additionalProperties: true,
  },
);

const productSchema = s.object(
  "A Paperform product.",
  {
    SKU: s.nullableString("The Paperform product SKU."),
    name: s.nullableString("The product name."),
    quantity: s.nullableNumber("The available product quantity."),
    price: s.nullableNumber("The product price."),
    minimum: s.nullableNumber("The minimum number of products to be selected."),
    maximum: s.nullableNumber("The maximum number of products to be selected."),
    discountable: s.nullableBoolean("Whether the product can be discounted."),
    raw: rawObjectSchema,
  },
  {
    required: ["SKU", "name", "quantity", "price", "minimum", "maximum", "discountable", "raw"],
    additionalProperties: true,
  },
);

const couponSchema = s.object(
  "A Paperform coupon.",
  {
    code: s.nullableString("The coupon code."),
    enabled: s.nullableBoolean("Whether the coupon is enabled."),
    target: s.nullableString("The target of the coupon."),
    discountAmount: s.nullableNumber("The discount as an amount."),
    discountPercentage: s.nullableNumber("The discount as a percentage."),
    expiresAt: s.nullableString("The datetime when the coupon expires."),
    raw: rawObjectSchema,
  },
  {
    required: ["code", "enabled", "target", "discountAmount", "discountPercentage", "expiresAt", "raw"],
    additionalProperties: true,
  },
);

export const paperformActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_forms",
    description: "List Paperform forms accessible to the authorized user.",
    inputSchema: s.object(
      "Filters and pagination controls for listing Paperform forms.",
      {
        search: s.nonEmptyString("Search forms by title."),
        ...paginationInputFields,
      },
      { optional: ["search", ...paginationOptionalKeys] },
    ),
    outputSchema: s.object(
      "A paginated Paperform form list.",
      {
        forms: s.array("The forms returned for this page.", formSchema),
        page: pageInfoSchema,
        raw: rawObjectSchema,
      },
      { required: ["forms", "page", "raw"] },
    ),
  }),
  defineProviderAction(service, {
    name: "get_form",
    description: "Get a Paperform form by slug, custom slug, or ID.",
    inputSchema: s.object("The Paperform form lookup input.", slugInputFields, { required: ["slug_or_id"] }),
    outputSchema: s.object("A single Paperform form result.", { form: formSchema }, { required: ["form"] }),
  }),
  defineProviderAction(service, {
    name: "list_form_fields",
    description: "List fields for a Paperform form.",
    inputSchema: s.object(
      "Filters for listing Paperform form fields.",
      {
        ...slugInputFields,
        search: s.nonEmptyString("Search fields by title."),
      },
      { optional: ["search"] },
    ),
    outputSchema: s.object(
      "A Paperform form field list.",
      {
        fields: s.array("The fields returned for this form.", fieldSchema),
        raw: rawObjectSchema,
      },
      { required: ["fields", "raw"] },
    ),
  }),
  defineProviderAction(service, {
    name: "get_form_field",
    description: "Get a Paperform form field by field key.",
    inputSchema: s.object(
      "The Paperform form field lookup input.",
      {
        ...slugInputFields,
        field_key: s.nonEmptyString("The Paperform field key."),
      },
      { required: ["slug_or_id", "field_key"] },
    ),
    outputSchema: s.object("A single Paperform form field result.", { field: fieldSchema }, { required: ["field"] }),
  }),
  defineProviderAction(service, {
    name: "list_form_submissions",
    description: "List submissions for a Paperform form.",
    inputSchema: s.object(
      "Filters and pagination controls for listing Paperform submissions.",
      {
        ...slugInputFields,
        ...paginationInputFields,
      },
      { optional: [...paginationOptionalKeys] },
    ),
    outputSchema: s.object(
      "A paginated Paperform submission list.",
      {
        submissions: s.array("The submissions returned for this page.", submissionSchema),
        page: pageInfoSchema,
        raw: rawObjectSchema,
      },
      { required: ["submissions", "page", "raw"] },
    ),
  }),
  defineProviderAction(service, {
    name: "get_form_submission",
    description: "Get a Paperform submission by form and submission ID.",
    inputSchema: s.object(
      "The Paperform form submission lookup input.",
      {
        ...slugInputFields,
        id: s.nonEmptyString("The Paperform submission ID."),
      },
      { required: ["slug_or_id", "id"] },
    ),
    outputSchema: s.object(
      "A single Paperform submission result.",
      { submission: submissionSchema },
      { required: ["submission"] },
    ),
  }),
  defineProviderAction(service, {
    name: "get_submission",
    description: "Get a Paperform submission by submission ID.",
    inputSchema: s.object(
      "The Paperform submission lookup input.",
      { id: s.nonEmptyString("The Paperform submission ID.") },
      { required: ["id"] },
    ),
    outputSchema: s.object(
      "A single Paperform submission result.",
      { submission: submissionSchema },
      { required: ["submission"] },
    ),
  }),
  defineProviderAction(service, {
    name: "list_form_partial_submissions",
    description: "List partial submissions for a Paperform form.",
    inputSchema: s.object(
      "Filters and pagination controls for listing Paperform partial submissions.",
      {
        ...slugInputFields,
        ...paginationInputFields,
      },
      { optional: [...paginationOptionalKeys] },
    ),
    outputSchema: s.object(
      "A paginated Paperform partial submission list.",
      {
        partial_submissions: s.array("The partial submissions returned for this page.", partialSubmissionSchema),
        page: pageInfoSchema,
        raw: rawObjectSchema,
      },
      { required: ["partial_submissions", "page", "raw"] },
    ),
  }),
  defineProviderAction(service, {
    name: "get_form_partial_submission",
    description: "Get a Paperform partial submission by form and partial submission ID.",
    inputSchema: s.object(
      "The Paperform form partial submission lookup input.",
      {
        ...slugInputFields,
        id: s.nonEmptyString("The Paperform partial submission ID."),
      },
      { required: ["slug_or_id", "id"] },
    ),
    outputSchema: s.object(
      "A single Paperform partial submission result.",
      { partial_submission: partialSubmissionSchema },
      { required: ["partial_submission"] },
    ),
  }),
  defineProviderAction(service, {
    name: "get_partial_submission",
    description: "Get a Paperform partial submission by partial submission ID.",
    inputSchema: s.object(
      "The Paperform partial submission lookup input.",
      { id: s.nonEmptyString("The Paperform partial submission ID.") },
      { required: ["id"] },
    ),
    outputSchema: s.object(
      "A single Paperform partial submission result.",
      { partial_submission: partialSubmissionSchema },
      { required: ["partial_submission"] },
    ),
  }),
  defineProviderAction(service, {
    name: "list_form_products",
    description: "List products for a Paperform form.",
    inputSchema: s.object(
      "Filters for listing Paperform form products.",
      {
        ...slugInputFields,
        search: s.nonEmptyString("Search products by name."),
      },
      { optional: ["search"] },
    ),
    outputSchema: s.object(
      "A Paperform product list.",
      {
        products: s.array("The products returned for this form.", productSchema),
        raw: rawObjectSchema,
      },
      { required: ["products", "raw"] },
    ),
  }),
  defineProviderAction(service, {
    name: "get_form_product",
    description: "Get a Paperform product by form and SKU.",
    inputSchema: s.object(
      "The Paperform form product lookup input.",
      {
        ...slugInputFields,
        product_sku: s.nonEmptyString("The Paperform product SKU."),
      },
      { required: ["slug_or_id", "product_sku"] },
    ),
    outputSchema: s.object("A single Paperform product result.", { product: productSchema }, { required: ["product"] }),
  }),
  defineProviderAction(service, {
    name: "list_form_coupons",
    description: "List coupons for a Paperform form.",
    inputSchema: s.object("The Paperform form coupon list input.", slugInputFields, { required: ["slug_or_id"] }),
    outputSchema: s.object(
      "A Paperform coupon list.",
      {
        coupons: s.array("The coupons returned for this form.", couponSchema),
        raw: rawObjectSchema,
      },
      { required: ["coupons", "raw"] },
    ),
  }),
  defineProviderAction(service, {
    name: "get_form_coupon",
    description: "Get a Paperform coupon by form and coupon code.",
    inputSchema: s.object(
      "The Paperform form coupon lookup input.",
      {
        ...slugInputFields,
        code: s.nonEmptyString("The Paperform coupon code."),
      },
      { required: ["slug_or_id", "code"] },
    ),
    outputSchema: s.object("A single Paperform coupon result.", { coupon: couponSchema }, { required: ["coupon"] }),
  }),
];
