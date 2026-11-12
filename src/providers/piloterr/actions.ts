import type { ProviderActionDefinition } from "../../core/provider-definition.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "piloterr";

const transitFileSchema = s.requiredObject("The screenshot stored in local transit storage.", {
  fileId: s.nonEmptyString("The local transit file identifier."),
  downloadUrl: s.url("The local URL used to download the screenshot."),
  sizeBytes: s.nonNegativeInteger("The screenshot size in bytes."),
  name: s.nonEmptyString("The screenshot filename."),
  mimeType: s.nonEmptyString("The screenshot MIME type, such as image/png or application/pdf."),
});
const piloterrTechnologyCategorySchema = s.looseObject(
  "One technology category returned by Piloterr.",
  {
    name: s.nullableString("Name of the category, such as CDN or CMS."),
    slug: s.nullableString("Identifier of the category."),
  },
  { optional: ["name", "slug"] },
);

const piloterrTechnologySchema = s.looseObject(
  "One technology returned by Piloterr.",
  {
    name: s.nullableString("Name of the technology."),
    slug: s.nullableString("Identifier of the technology."),
    version: s.nullableString("Version, when it can be detected."),
    website: s.nullableString("Website of the technology."),
    description: s.nullableString("What the technology does."),
    confidence: s.nullableNumber("Confidence of the detection, from 0 to 100."),
    categories: s.array("Categories of the technology.", piloterrTechnologyCategorySchema),
  },
  { optional: ["name", "slug", "version", "website", "description", "confidence", "categories"] },
);

const piloterrSearchResultSchema = s.looseObject(
  "One search result returned by Piloterr.",
  {
    position: s.nullableNumber("Position of the result on the page."),
    title: s.nullableString("Title of the result."),
    link: s.nullableString("URL of the result."),
    domain: s.nullableString("Domain of the result."),
    displayed_link: s.nullableString("Link as Google displays it."),
    source: s.nullableString("Source or site name."),
    snippet: s.nullableString("Snippet shown under the title."),
  },
  { optional: ["position", "title", "link", "domain", "displayed_link", "source", "snippet"] },
);

const piloterrAmazonProductSchema = s.looseObject(
  "One amazon product returned by Piloterr.",
  {
    asin: s.nullableString("ASIN of the product."),
    title: s.nullableString("Title of the product."),
    url: s.nullableString("URL of the product page."),
    price: s.nullableNumber("Price shown in the results."),
    real_price: s.nullableNumber("List price before discount, when shown."),
    rating: s.nullableNumber("Average rating out of 5."),
    reviews_count: s.nullableNumber("Number of reviews."),
  },
  { optional: ["asin", "title", "url", "price", "real_price", "rating", "reviews_count"] },
);

const piloterrEbaySellerSchema = s.looseObject(
  "Seller of the listing.",
  {
    name: s.nullableString("Name of the seller."),
    feedback: s.nullableString("Feedback count of the seller."),
    positive_feedback_percent: s.nullableNumber("Share of positive feedback, in percent."),
  },
  { optional: ["name", "feedback", "positive_feedback_percent"] },
);

const piloterrEbaySpecificationSchema = s.looseObject(
  "One ebay specification returned by Piloterr.",
  {
    name: s.nullableString("Name of the specific."),
    value: s.nullableString("Value of the specific."),
  },
  { optional: ["name", "value"] },
);

const piloterrEbayListingSchema = s.looseObject(
  "One ebay listing returned by Piloterr.",
  {
    position: s.nullableNumber("Position of the listing on the page."),
    item_id: s.nullableString("eBay item ID."),
    title: s.nullableString("Title of the listing."),
    subtitle: s.nullableString("Subtitle of the listing."),
    url: s.nullableString("URL of the listing."),
    price: s.nullableNumber("Price of the listing."),
    currency: s.nullableString("ISO 4217 code of the price."),
    price_display: s.nullableString("Price as eBay displays it."),
    condition: s.nullableString("Condition of the item."),
    buying_format: s.nullableString("Buying format, such as Buy It Now or Auction."),
    shipping: s.nullableString("Shipping cost or summary."),
    image_url: s.nullableString("URL of the main image."),
    seller: piloterrEbaySellerSchema,
  },
  {
    optional: [
      "position",
      "item_id",
      "title",
      "subtitle",
      "url",
      "price",
      "currency",
      "price_display",
      "condition",
      "buying_format",
      "shipping",
      "image_url",
      "seller",
    ],
  },
);

const piloterrLinkedinHeadquarterSchema = s.looseObject(
  "Headquarters address.",
  {
    line1: s.nullableString("Street address."),
    city: s.nullableString("City."),
    postal_code: s.nullableString("Postal code."),
    country: s.nullableString("Country code."),
  },
  { optional: ["line1", "city", "postal_code", "country"] },
);

const piloterrLinkedinCompanyLinkSchema = s.looseObject(
  "One linkedin company link returned by Piloterr.",
  {
    company_name: s.nullableString("Name of the company."),
    company_url: s.nullableString("URL of its LinkedIn page."),
  },
  { optional: ["company_name", "company_url"] },
);

const piloterrCrunchbaseCategorySchema = s.looseObject(
  "One crunchbase category returned by Piloterr.",
  {
    name: s.nullableString("Name of the category."),
    permalink: s.nullableString("Crunchbase permalink of the category."),
  },
  { optional: ["name", "permalink"] },
);

const piloterrCrunchbaseLocationSchema = s.looseObject(
  "One crunchbase location returned by Piloterr.",
  {
    name: s.nullableString("Name of the place."),
    type: s.nullableString("Type of place, such as city or country."),
  },
  { optional: ["name", "type"] },
);

const piloterrCrunchbaseInvestorSchema = s.looseObject(
  "One crunchbase investor returned by Piloterr.",
  {
    investor_identifier: s.looseObject(
      "Investor identifier returned by Piloterr.",
      {
        value: s.nullableString("Name of the investor."),
        permalink: s.nullableString("Crunchbase permalink of the investor."),
      },
      { optional: ["value", "permalink"] },
    ),
    funding_round_identifier: s.looseObject(
      "Funding round identifier returned by Piloterr.",
      {
        value: s.nullableString("Funding round the investor took part in."),
      },
      { optional: ["value"] },
    ),
  },
  { optional: ["investor_identifier", "funding_round_identifier"] },
);

const piloterrCrunchbaseProductSchema = s.looseObject(
  "One crunchbase product returned by Piloterr.",
  {
    name: s.nullableString("Name of the product."),
    description: s.nullableString("Description of the product."),
  },
  { optional: ["name", "description"] },
);

const piloterrZillowPhotoSchema = s.looseObject(
  "One zillow photo returned by Piloterr.",
  {
    url: s.nullableString("URL of the photo."),
    width: s.nullableNumber("Width of the photo in pixels."),
  },
  { optional: ["url", "width"] },
);

export const piloterrActions: ProviderActionDefinition[] = [
  defineProviderAction(service, {
    name: "fetch_html",
    operationType: "read",
    description: "Fetch a public web page over fast HTTP, without running JavaScript, and get its HTML.",
    inputSchema: s.actionInput(
      {
        url: s.nonEmptyString('URL of the page (e.g., "https://example.com").'),
      },
      ["url"],
      "Input for Fetch HTML.",
    ),
    outputSchema: s.actionOutput({ html: s.string("HTML of the page.") }, "The page HTML returned by Piloterr."),
  }),
  defineProviderAction(service, {
    name: "render_html",
    operationType: "read",
    description: "Render a JavaScript-heavy page in a headless browser and get the HTML after rendering.",
    inputSchema: s.actionInput(
      {
        url: s.nonEmptyString('URL of the page (e.g., "https://example.com").'),
        waitInSeconds: s.number("Seconds to wait after the page loads before reading the HTML (defaults to 0).", {
          minimum: 0,
        }),
        blockAds: s.boolean("Block ad requests while rendering."),
      },
      ["url"],
      "Input for Render HTML.",
    ),
    outputSchema: s.actionOutput(
      { html: s.string("HTML of the page after rendering.") },
      "The page HTML returned by Piloterr.",
    ),
  }),
  defineProviderAction(service, {
    name: "screenshot",
    operationType: "read",
    description:
      "Capture a public web page as a PNG, JPEG, WebP image or a PDF, by viewport, full page or CSS selector, and store it as a file.",
    inputSchema: s.actionInput(
      {
        url: s.nonEmptyString('URL of the page (e.g., "https://example.com").'),
        format: s.stringEnum('Output format: png, jpeg, webp or pdf (defaults to "png").', [
          "png",
          "jpeg",
          "webp",
          "pdf",
        ]),
        fullPage: s.boolean("Capture the entire page instead of the visible viewport."),
        device: s.stringEnum('Device to emulate (e.g., "iphone_14_pro").', [
          "iphone_14_pro",
          "iphone_14_pro_max",
          "iphone_13_pro_max",
          "iphone_13_mini",
          "iphone_12",
          "iphone_x",
          "ipad",
          "pixel_7_pro",
          "pixel_6a",
          "pixel_5",
          "galaxy_s23_ultra",
          "galaxy_s23",
          "galaxy_s8",
          "galaxy_fold4",
          "huawei_mate_50_pro",
          "huawei_p60_pro",
          "redmi_note_12_pro",
          "redmi_note_11",
        ]),
        selector: s.nonEmptyString('CSS selector of one element to capture (e.g., "#pricing").'),
        viewportWidth: s.integer("Width of the browser viewport in pixels (defaults to 1280).", { minimum: 1 }),
        viewportHeight: s.integer("Height of the browser viewport in pixels (defaults to 1024).", { minimum: 1 }),
        delay: s.number("Seconds to wait before capturing (defaults to 0).", { minimum: 0 }),
        removeCookieBanners: s.boolean("Remove cookie banners before capturing."),
        removeAds: s.boolean("Remove ads before capturing."),
      },
      ["url"],
      "Input for Take Screenshot.",
    ),
    outputSchema: s.actionOutput({ file: transitFileSchema }, "The screenshot stored in local transit storage."),
  }),
  defineProviderAction(service, {
    name: "detect_technologies",
    operationType: "read",
    description: "Detect the technologies a website runs, such as its CMS, frameworks, analytics, CDN and hosting.",
    inputSchema: s.actionInput(
      {
        url: s.nonEmptyString('URL of the page (e.g., "https://example.com").'),
      },
      ["url"],
      "Input for Detect Technologies.",
    ),
    outputSchema: s.looseObject(
      "The Piloterr response for Detect Technologies.",
      {
        technologies: s.array("Technologies detected on the website.", piloterrTechnologySchema),
      },
      { optional: ["technologies"] },
    ),
  }),
  defineProviderAction(service, {
    name: "google_search",
    operationType: "read",
    description:
      "Search Google and get organic results with their position, title, link and snippet, and the estimated total.",
    inputSchema: s.actionInput(
      {
        query: s.nonEmptyString('Search query (e.g., "best electric cars").'),
        country: s.nonEmptyString('Two-letter country code to search from (e.g., "us").'),
        language: s.nonEmptyString('Two-letter language code of the results (e.g., "en").'),
        location: s.nonEmptyString('City or region to search from (e.g., "Paris, France").'),
        page: s.integer("Page of results, starting at 1.", { minimum: 1 }),
        numResults: s.integer("Number of results per page (e.g., 10).", { minimum: 1 }),
      },
      ["query"],
      "Input for Google Search.",
    ),
    outputSchema: s.looseObject(
      "The Piloterr response for Google Search.",
      {
        organic_results: s.array("Organic results.", piloterrSearchResultSchema),
        search_information: s.looseObject(
          "Search information returned by Piloterr.",
          {
            total_results: s.nullableNumber("Estimated total number of results."),
          },
          { optional: ["total_results"] },
        ),
        pagination: s.looseObject(
          "Pagination returned by Piloterr.",
          {
            has_next_page: s.nullableBoolean("Whether another page of results exists."),
          },
          { optional: ["has_next_page"] },
        ),
      },
      { optional: ["organic_results", "search_information", "pagination"] },
    ),
  }),
  defineProviderAction(service, {
    name: "amazon_search",
    operationType: "read",
    description: "Search an Amazon marketplace and get products with ASIN, title, price, rating and review count.",
    inputSchema: s.actionInput(
      {
        query: s.nonEmptyString('Keyword or phrase to search for (e.g., "playstation 5").'),
        marketplace: s.nonEmptyString(
          'Amazon domain extension of the marketplace (e.g., "com", "fr", "co.uk"; defaults to "com").',
        ),
        page: s.integer("Page of results, starting at 1.", { minimum: 1 }),
      },
      ["query"],
      "Input for Amazon Search.",
    ),
    outputSchema: s.actionOutput(
      { products: s.array("Products found on Amazon", piloterrAmazonProductSchema) },
      "Products found on Amazon from Piloterr.",
    ),
  }),
  defineProviderAction(service, {
    name: "ebay_get_listing",
    operationType: "read",
    description:
      "Get an eBay listing by item ID or URL, with its price, condition, availability, seller, shipping and item specifics.",
    inputSchema: s.actionInput(
      {
        item: s.nonEmptyString('eBay item ID or listing URL (e.g., "257758922911").'),
      },
      ["item"],
      "Input for Get eBay Listing.",
    ),
    outputSchema: s.looseObject(
      "The Piloterr response for Get eBay Listing.",
      {
        item_id: s.nullableString("eBay item ID."),
        title: s.nullableString("Title of the listing."),
        url: s.nullableString("URL of the listing."),
        price: s.nullableNumber("Price of the listing."),
        currency: s.nullableString("ISO 4217 code of the price."),
        price_display: s.nullableString("Price as eBay displays it."),
        condition: s.nullableString("Condition of the item, such as New or Used."),
        condition_description: s.nullableString("Seller's description of the condition."),
        availability: s.nullableString("Availability, such as InStock or OutOfStock."),
        is_buy_it_now: s.nullableBoolean("Whether the listing can be bought now."),
        is_best_offer: s.nullableBoolean("Whether the seller accepts best offers."),
        watchers: s.nullableNumber("Number of people watching the listing."),
        image_url: s.nullableString("URL of the main image."),
        seller: piloterrEbaySellerSchema,
        shipping: s.looseObject(
          "Shipping returned by Piloterr.",
          {
            summary: s.nullableString("Shipping summary."),
          },
          { optional: ["summary"] },
        ),
        returns: s.looseObject(
          "Returns returned by Piloterr.",
          {
            summary: s.nullableString("Returns policy summary."),
          },
          { optional: ["summary"] },
        ),
        specifications: s.array("Item specifics.", piloterrEbaySpecificationSchema),
        payment_methods: s.array("Accepted payment methods.", s.string()),
      },
      {
        optional: [
          "item_id",
          "title",
          "url",
          "price",
          "currency",
          "price_display",
          "condition",
          "condition_description",
          "availability",
          "is_buy_it_now",
          "is_best_offer",
          "watchers",
          "image_url",
          "seller",
          "shipping",
          "returns",
          "specifications",
          "payment_methods",
        ],
      },
    ),
  }),
  defineProviderAction(service, {
    name: "ebay_search",
    operationType: "read",
    description:
      "Search eBay listings by keyword or search URL and get their price, condition, buying format, shipping and seller.",
    inputSchema: s.actionInput(
      {
        query: s.nonEmptyString('Keyword on ebay.com, or a search URL on a supported eBay site (e.g., "laptop").'),
        page: s.integer("Page of results, starting at 1.", { minimum: 1 }),
      },
      ["query"],
      "Input for eBay Search.",
    ),
    outputSchema: s.looseObject(
      "The Piloterr response for eBay Search.",
      {
        results: s.array("Listings found on eBay.", piloterrEbayListingSchema),
        pagination: s.looseObject(
          "Pagination returned by Piloterr.",
          {
            next: s.nullableString("URL of the next page of results."),
            page: s.nullableNumber("Current page."),
          },
          { optional: ["next", "page"] },
        ),
      },
      { optional: ["results", "pagination"] },
    ),
  }),
  defineProviderAction(service, {
    name: "linkedin_company",
    operationType: "read",
    description:
      "Get a LinkedIn company's profile by page URL, slug or ID, or by website domain: industry, size, headquarters, specialties and followers.",
    inputSchema: s.requireExactlyOneProperty(
      s.actionInput(
        {
          query: s.nonEmptyString(
            'LinkedIn company page URL, slug or ID (e.g., "https://www.linkedin.com/company/ferrari").',
          ),
          domain: s.nonEmptyString(
            'Company website domain, when the LinkedIn page is unknown (e.g., "ferrari.com"). Provide exactly one of query or domain.',
          ),
        },
        [],
        "Input for Get LinkedIn Company.",
      ),
      ["query", "domain"],
    ),
    outputSchema: s.looseObject(
      "The Piloterr response for Get LinkedIn Company.",
      {
        company_name: s.nullableString("Name of the company."),
        company_id: s.nullableNumber("LinkedIn ID of the company."),
        company_url: s.nullableString("URL of the LinkedIn page."),
        tagline: s.nullableString("Tagline of the company."),
        description: s.nullableString("About text of the company."),
        website: s.nullableString("Website of the company."),
        industry: s.nullableString("Industry of the company."),
        founded: s.nullableNumber("Year the company was founded."),
        staff_count: s.nullableNumber("Number of employees on LinkedIn."),
        staff_range: s.nullableString("Company size range."),
        follower_count: s.nullableNumber("Number of LinkedIn followers."),
        logo_url: s.nullableString("URL of the company logo."),
        specialities: s.array("Specialties of the company.", s.string()),
        locations: s.array("Office addresses.", s.string()),
        headquarter: piloterrLinkedinHeadquarterSchema,
        similar_companies: s.array("Similar companies LinkedIn suggests.", piloterrLinkedinCompanyLinkSchema),
      },
      {
        optional: [
          "company_name",
          "company_id",
          "company_url",
          "tagline",
          "description",
          "website",
          "industry",
          "founded",
          "staff_count",
          "staff_range",
          "follower_count",
          "logo_url",
          "specialities",
          "locations",
          "headquarter",
          "similar_companies",
        ],
      },
    ),
  }),
  defineProviderAction(service, {
    name: "crunchbase_company",
    operationType: "read",
    description:
      "Get a company's Crunchbase profile by name, permalink or URL, or by website domain: description, size, categories, locations, investors and products.",
    inputSchema: s.requireExactlyOneProperty(
      s.actionInput(
        {
          query: s.nonEmptyString('Company name, Crunchbase permalink or URL (e.g., "openai").'),
          domain: s.nonEmptyString(
            'Company website domain, for a reverse lookup (e.g., "openai.com"). Provide exactly one of query or domain.',
          ),
        },
        [],
        "Input for Get Crunchbase Company.",
      ),
      ["query", "domain"],
    ),
    outputSchema: s.looseObject(
      "The Piloterr response for Get Crunchbase Company.",
      {
        name: s.nullableString("Name of the company."),
        permalink: s.nullableString("Crunchbase permalink of the company."),
        headline: s.nullableString("Short description."),
        description: s.nullableString("Full description."),
        website: s.nullableString("Website of the company."),
        logo: s.nullableString("URL of the company logo."),
        company_type: s.nullableString("Company type, such as for profit."),
        employee_count: s.nullableString("Employee count range."),
        founded: s.nullableString("Founding date."),
        phone_number: s.nullableString("Phone number of the company."),
        contact_email: s.nullableString("Contact email of the company."),
        growth_and_heat: s.looseObject(
          "Growth and heat returned by Piloterr.",
          {
            heat_score: s.nullableNumber("Crunchbase heat score."),
            growth_score: s.nullableNumber("Crunchbase growth score."),
          },
          { optional: ["heat_score", "growth_score"] },
        ),
        aliases: s.array("Other names of the company.", s.string()),
        tags: s.array("Crunchbase tags, such as unicorn.", s.string()),
        categories: s.array("Industry categories.", piloterrCrunchbaseCategorySchema),
        location: s.array("Headquarters location, from city to continent.", piloterrCrunchbaseLocationSchema),
        investors_list: s.array("Investors of the company.", piloterrCrunchbaseInvestorSchema),
        product: s.array("Products of the company.", piloterrCrunchbaseProductSchema),
      },
      {
        optional: [
          "name",
          "permalink",
          "headline",
          "description",
          "website",
          "logo",
          "company_type",
          "employee_count",
          "founded",
          "phone_number",
          "contact_email",
          "growth_and_heat",
          "aliases",
          "tags",
          "categories",
          "location",
          "investors_list",
          "product",
        ],
      },
    ),
  }),
  defineProviderAction(service, {
    name: "zillow_property",
    operationType: "read",
    description:
      "Get a Zillow home from its homedetails URL: address, price, Zestimate, status, size, rooms, year built and photos.",
    inputSchema: s.actionInput(
      {
        url: s.nonEmptyString(
          'Full Zillow homedetails URL (e.g., "https://www.zillow.com/homedetails/20-Kyle-Ct-Staten-Island-NY-10312/32361983_zpid/").',
        ),
      },
      ["url"],
      "Input for Get Zillow Property.",
    ),
    outputSchema: s.looseObject(
      "The Piloterr response for Get Zillow Property.",
      {
        zpid: s.nullableNumber("Zillow property ID."),
        address: s.looseObject(
          "Address returned by Piloterr.",
          {
            street_address: s.nullableString("Street address."),
          },
          { optional: ["street_address"] },
        ),
        city: s.nullableString("City."),
        state: s.nullableString("State."),
        zipcode: s.nullableString("ZIP code."),
        county: s.nullableString("County."),
        price: s.nullableNumber("Listing or last sale price."),
        currency: s.nullableString("ISO 4217 code of the prices."),
        zestimate: s.nullableNumber("Zillow's estimated market value."),
        home_status: s.nullableString("Status, such as FOR_SALE or RECENTLY_SOLD."),
        home_type: s.nullableString("Home type, such as SINGLE_FAMILY."),
        bedrooms: s.nullableNumber("Number of bedrooms."),
        bathrooms: s.nullableNumber("Number of bathrooms."),
        living_area: s.nullableNumber("Living area in square feet."),
        lot_size: s.nullableNumber("Lot size in square feet."),
        year_built: s.nullableNumber("Year the home was built."),
        reso_facts: s.looseObject(
          "Reso facts returned by Piloterr.",
          {
            price_per_square_foot: s.nullableNumber("Price per square foot."),
          },
          { optional: ["price_per_square_foot"] },
        ),
        description: s.nullableString("Listing description."),
        latitude: s.nullableNumber("Latitude."),
        longitude: s.nullableNumber("Longitude."),
        photos: s.array("Photos of the home.", piloterrZillowPhotoSchema),
      },
      {
        optional: [
          "zpid",
          "address",
          "city",
          "state",
          "zipcode",
          "county",
          "price",
          "currency",
          "zestimate",
          "home_status",
          "home_type",
          "bedrooms",
          "bathrooms",
          "living_area",
          "lot_size",
          "year_built",
          "reso_facts",
          "description",
          "latitude",
          "longitude",
          "photos",
        ],
      },
    ),
  }),
];
