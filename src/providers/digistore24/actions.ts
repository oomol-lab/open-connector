import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "digistore24";

const pageNoSchema = s.integer("Page number to request. Digistore24 pages start at 1.", {
  minimum: 1,
});

const pageSizeSchema = s.integer("Number of items to request per page.", { minimum: 1 });

const rawRecordSchema = s.looseObject("The raw object returned by Digistore24.");

const userInfoSchema = s.requiredObject("Current Digistore24 API key owner information.", {
  userId: s.nullable(s.integer("Numeric ID of the API key owner.")),
  userName: s.nullable(s.string("Digistore24 login name of the API key owner.")),
  grantedRoles: s.nullable(s.string("Comma-separated role codes granted to the API key owner.")),
  grantedRolesMessage: s.nullable(s.string("Comma-separated role names granted to the API key owner.")),
  raw: rawRecordSchema,
});

const productSummarySchema = s.requiredObject("Digistore24 product summary.", {
  id: s.nullable(s.integer("Numeric product ID.")),
  name: s.nullable(s.string("Product name.")),
  note: s.nullable(s.string("Product note when returned.")),
  tag: s.nullable(s.string("Product tag when returned.")),
  language: s.nullable(s.string("Product language code.")),
  productGroupId: s.nullable(s.integer("Numeric product group ID when returned.")),
  productGroupName: s.nullable(s.string("Product group name when returned.")),
  unitsLeft: s.nullable(s.string("Remaining product units or infinite marker.")),
  createdAt: s.nullable(s.string("Product creation timestamp returned by Digistore24.")),
  modifiedAt: s.nullable(s.string("Product modification timestamp returned by Digistore24.")),
  raw: rawRecordSchema,
});

const buyerSchema = s.requiredObject("Digistore24 buyer record.", {
  id: s.nullable(s.integer("Numeric buyer ID.")),
  addressId: s.nullable(s.integer("Numeric buyer address ID when returned.")),
  createdAt: s.nullable(s.string("Buyer creation timestamp returned by Digistore24.")),
  email: s.nullable(s.string("Buyer email address.")),
  firstName: s.nullable(s.string("Buyer first name.")),
  lastName: s.nullable(s.string("Buyer last name.")),
  salutation: s.nullable(s.string("Buyer salutation.")),
  title: s.nullable(s.string("Buyer title when returned.")),
  company: s.nullable(s.string("Buyer company name when returned.")),
  street: s.nullable(s.string("Buyer street address.")),
  streetName: s.nullable(s.string("Buyer street name when returned.")),
  streetNumber: s.nullable(s.string("Buyer street number when returned.")),
  zipcode: s.nullable(s.string("Buyer postal code.")),
  city: s.nullable(s.string("Buyer city.")),
  state: s.nullable(s.string("Buyer state or province when returned.")),
  country: s.nullable(s.string("Buyer country code.")),
  phoneNo: s.nullable(s.string("Buyer phone number when returned.")),
  raw: rawRecordSchema,
});

const purchaseSchema = s.requiredObject("Digistore24 purchase record.", {
  id: s.nullable(s.string("Digistore24 purchase ID.")),
  amount: s.nullable(s.number("Purchase amount when returned.")),
  currency: s.nullable(s.string("Purchase currency code.")),
  createdAt: s.nullable(s.string("Purchase creation timestamp returned by Digistore24.")),
  billingType: s.nullable(s.string("Purchase billing type code.")),
  billingStatus: s.nullable(s.string("Purchase billing status code.")),
  receiptUrl: s.nullable(s.string("Receipt URL when returned.")),
  invoiceUrl: s.nullable(s.string("Invoice URL when returned.")),
  buyer: s.nullable(buyerSchema),
  items: s.array("Purchase line items returned by Digistore24.", rawRecordSchema),
  transactions: s.array("Purchase transactions returned by Digistore24.", rawRecordSchema),
  raw: rawRecordSchema,
});

const purchaseSearchSchema = s.object(
  "Purchase search filters accepted by Digistore24.",
  {
    role: s.string("Comma-separated role filter such as vendor, affiliate, or other."),
    productId: s.string("Comma-separated product IDs to filter purchases by."),
    firstName: s.string("Buyer first name filter."),
    lastName: s.string("Buyer last name filter."),
    email: s.string("Buyer email filter."),
    hasAffiliate: s.boolean("Whether to filter purchases by affiliate presence."),
    affiliateName: s.string("Affiliate name filter."),
    orderType: s.stringEnum("Order type filter.", ["live", "test"]),
    payMethod: s.string("Comma-separated payment method codes."),
    billingType: s.string("Comma-separated billing type codes."),
    transactionType: s.string("Comma-separated transaction type codes."),
    currency: s.string("Currency code filter."),
    purchaseId: s.string("Comma-separated purchase IDs to filter purchases by."),
  },
  {
    optional: [
      "role",
      "productId",
      "firstName",
      "lastName",
      "email",
      "hasAffiliate",
      "affiliateName",
      "orderType",
      "payMethod",
      "billingType",
      "transactionType",
      "currency",
      "purchaseId",
    ],
  },
);

export const digistore24Actions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_user_info",
    operationType: "read",
    description: "Retrieve information about the Digistore24 user that owns the API key.",
    inputSchema: s.object("Input parameters for retrieving the current Digistore24 user.", {}),
    outputSchema: userInfoSchema,
  }),
  defineProviderAction(service, {
    name: "list_products",
    operationType: "read",
    description: "List products from the connected Digistore24 account.",
    inputSchema: s.object(
      "Input parameters for listing Digistore24 products.",
      {
        sortBy: s.stringEnum("Product sort order.", ["name", "group"]),
      },
      { optional: ["sortBy"] },
    ),
    outputSchema: s.requiredObject("Digistore24 product list.", {
      products: s.array("Products returned by Digistore24.", productSummarySchema),
    }),
  }),
  defineProviderAction(service, {
    name: "get_product",
    operationType: "read",
    description: "Retrieve details for a Digistore24 product.",
    inputSchema: s.requiredObject("Input parameters for retrieving a Digistore24 product.", {
      productId: s.integer("Numeric ID of the product to retrieve.", { minimum: 1 }),
    }),
    outputSchema: s.requiredObject("Digistore24 product details.", {
      product: rawRecordSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_buyers",
    operationType: "read",
    description: "List buyers from the connected Digistore24 account.",
    inputSchema: s.object(
      "Input parameters for listing Digistore24 buyers.",
      {
        pageNo: pageNoSchema,
        pageSize: pageSizeSchema,
      },
      { optional: ["pageNo", "pageSize"] },
    ),
    outputSchema: s.requiredObject("Paginated Digistore24 buyer list.", {
      pageNo: s.nullable(s.integer("Current page number returned by Digistore24.")),
      pageSize: s.nullable(s.integer("Page size returned by Digistore24.")),
      itemCount: s.nullable(s.integer("Total buyer count returned by Digistore24.")),
      pageCount: s.nullable(s.integer("Total page count returned by Digistore24.")),
      buyers: s.array("Buyers returned by Digistore24.", buyerSchema),
      raw: rawRecordSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "get_buyer",
    operationType: "read",
    description: "Retrieve details for a Digistore24 buyer.",
    inputSchema: s.requiredObject("Input parameters for retrieving a Digistore24 buyer.", {
      buyerId: s.integer("Numeric ID of the buyer to retrieve.", { minimum: 1 }),
    }),
    outputSchema: s.requiredObject("Digistore24 buyer details.", {
      buyer: buyerSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_purchases",
    operationType: "read",
    description: "List purchases and sales from the connected Digistore24 account.",
    inputSchema: s.object(
      "Input parameters for listing Digistore24 purchases.",
      {
        from: s.nonEmptyString(
          'Start time for the purchase list, such as "2014-02-28 23:11:24", "now", "-3d", or "start".',
        ),
        to: s.nonEmptyString("End time for the purchase list, such as now or a timestamp."),
        search: purchaseSearchSchema,
        sortBy: s.stringEnum("Purchase sort criterion.", ["date", "earning", "amount"]),
        sortOrder: s.stringEnum("Purchase sort order.", ["asc", "desc"]),
        loadTransactions: s.boolean("Whether to include transactions for each purchase."),
        pageNo: pageNoSchema,
        pageSize: pageSizeSchema,
      },
      {
        optional: ["from", "to", "search", "sortBy", "sortOrder", "loadTransactions", "pageNo", "pageSize"],
      },
    ),
    outputSchema: s.requiredObject("Digistore24 purchase list.", {
      purchases: s.array("Purchases returned by Digistore24.", purchaseSchema),
      raw: rawRecordSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "get_purchase",
    operationType: "read",
    description: "Retrieve details for one or more Digistore24 purchases.",
    inputSchema: s.requiredObject("Input parameters for retrieving Digistore24 purchase details.", {
      purchaseId: s.nonEmptyString("Single purchase ID or comma-separated purchase IDs to retrieve."),
    }),
    outputSchema: s.requiredObject("Digistore24 purchase details.", {
      purchases: s.array("Purchase records returned by Digistore24.", purchaseSchema),
      raw: rawRecordSchema,
    }),
  }),
];
