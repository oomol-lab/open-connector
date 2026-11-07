import type { JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";

const money = s.looseObject("An Etsy money amount; divide amount by divisor to obtain the currency value.", {
  amount: s.integer("The amount in fractional currency units."),
  divisor: s.integer("The divisor used to convert the amount."),
  currency_code: s.string("The currency code."),
});
export const self: JsonSchema = s.looseObject("The connected Etsy account.", {
  user_id: s.integer("The Etsy user ID."),
  shop_id: s.nullable(s.integer("The Etsy shop ID.")),
});
export const shop: JsonSchema = s.looseObject("An Etsy shop with additional upstream fields preserved.", {
  shop_id: s.integer("The Etsy shop ID."),
  user_id: s.integer("The shop owner's user ID."),
  shop_name: s.string("The shop name."),
  title: s.nullable(s.string("The shop title.")),
  url: s.string("The public shop URL."),
  listing_active_count: s.integer("The number of active listings."),
});
export const listing: JsonSchema = s.looseObject(
  "An Etsy listing with requested associations and additional upstream fields.",
  {
    listing_id: s.integer("The Etsy listing ID."),
    shop_id: s.integer("The Etsy shop ID."),
    title: s.string("The listing title."),
    description: s.string("The listing description."),
    state: s.string("The current listing state."),
    quantity: s.integer("The available listing quantity."),
    url: s.string("The public listing URL."),
    price: money,
  },
);
export const inventory: JsonSchema = s.looseObject("The listing inventory and variation dependencies.", {
  products: s.array(
    "The inventory products, SKUs, property values, and offerings.",
    s.looseObject("An inventory product.", {}),
  ),
  price_on_property: s.array("Property IDs that affect price.", s.integer("A property ID.")),
  quantity_on_property: s.array("Property IDs that affect quantity.", s.integer("A property ID.")),
  sku_on_property: s.array("Property IDs that affect SKU.", s.integer("A property ID.")),
});
export const receipt: JsonSchema = s.looseObject("An Etsy order receipt with additional upstream fields preserved.", {
  receipt_id: s.integer("The Etsy receipt ID."),
  seller_user_id: s.integer("The seller's user ID."),
  buyer_user_id: s.integer("The buyer's user ID."),
  status: s.string("The receipt status."),
  is_paid: s.boolean("Whether payment has been received."),
  is_shipped: s.boolean("Whether the receipt is marked as shipped."),
  grandtotal: money,
  transactions: s.array("The purchased items.", s.looseObject("A receipt transaction.", {})),
  shipments: s.array("The recorded shipments.", s.looseObject("A receipt shipment.", {})),
});
const transaction = s.looseObject("An Etsy receipt transaction.", {
  transaction_id: s.integer("The Etsy transaction ID."),
  receipt_id: s.integer("The Etsy receipt ID."),
  listing_id: s.integer("The Etsy listing ID."),
  title: s.string("The purchased item's title."),
  quantity: s.integer("The purchased quantity."),
  price: money,
});
const section = s.looseObject("An Etsy shop section.", {
  shop_section_id: s.integer("The Etsy shop section ID."),
  title: s.string("The section title."),
  rank: s.integer("The section display rank."),
  active_listing_count: s.integer("The number of active listings in the section."),
});
function page(item: Record<string, unknown>) {
  return s.looseObject("An Etsy result collection.", {
    count: s.integer("The total number of matching records."),
    results: s.array("The records returned by this request.", item),
  });
}
export const listingPage: JsonSchema = page(listing);
export const receiptPage: JsonSchema = page(receipt);
export const transactionPage: JsonSchema = page(transaction);
export const sectionPage: JsonSchema = page(section);
