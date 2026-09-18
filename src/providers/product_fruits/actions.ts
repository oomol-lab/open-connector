import type { ProviderActionDefinition } from "../../core/provider-definition.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const categoryContentSchema = s.looseObject("Localized category content returned by Product Fruits.", {
  lang: s.string("ISO 639-1 language code."),
  title: s.string("Localized category title."),
  description: s.string("Localized category description."),
  slug: s.string("Localized category URL slug."),
  slug_state: s.string("Slug generation mode returned by Product Fruits."),
});

const categorySchema = s.looseObject("Knowledge-base category returned by Product Fruits.", {
  id: s.number("Internal Product Fruits category ID."),
  correlationId: s.nullable(s.string("External correlation ID when assigned.")),
  parentCategoryId: s.nullable(s.number("Parent category ID, or null for a root category.")),
  order: s.number("Display order within the parent category."),
  isFeatured: s.boolean("Whether the category is featured."),
  icon: s.nullable(s.string("Category icon identifier when assigned.")),
  contents: s.array("Localized category content entries.", categoryContentSchema),
});

const articleContentSummarySchema = s.looseObject("Localized article content summary returned by Product Fruits.", {
  id: s.string("Internal content entry ID."),
  correlationId: s.nullable(s.string("External content correlation ID when assigned.")),
  lang: s.string("ISO 639-1 language code."),
  published: s.boolean("Whether this content entry is published."),
  lastModified: s.string("ISO 8601 timestamp of the latest modification."),
});

const articleSummarySchema = s.looseObject("Knowledge-base article summary returned by Product Fruits.", {
  id: s.string("Internal Product Fruits article ID."),
  correlationId: s.nullable(s.string("External article correlation ID when assigned.")),
  lastModified: s.string("ISO 8601 timestamp of the latest modification."),
  categoryId: s.nullable(s.number("Category ID, or null for an uncategorized article.")),
  isPrivate: s.boolean("Whether the article is private."),
  isHidden: s.boolean("Whether the article is hidden from navigation."),
  isFeatured: s.boolean("Whether the article is featured."),
  featuredOrder: s.nullable(s.number("Featured display order when assigned.")),
  order: s.number("Display order within the category."),
  version: s.string("Article format version."),
  alternateSlugs: s.nullable(s.string("JSON string containing alternate slugs by language.")),
  contents: s.array("Localized content summaries for the article.", articleContentSummarySchema),
});

const conversionResultSchema = s.looseObject(
  "A conversion note produced while rendering article content as Markdown.",
  {
    type: s.string("Conversion result type, such as dropped or simplified."),
    element: s.string("HTML element affected by the conversion."),
    count: s.number("Number of affected elements."),
    message: s.string("Human-readable conversion detail."),
  },
);

export const productFruitsActions: ProviderActionDefinition[] = [
  defineProviderAction("product_fruits", {
    name: "list_knowledge_base_categories",
    operationType: "read",
    description: "List all Product Fruits knowledge-base categories and localized content.",
    inputSchema: s.requiredObject("This action does not require any input fields.", {}),
    outputSchema: s.requiredObject("Product Fruits knowledge-base category list.", {
      categories: s.array("Knowledge-base categories.", categorySchema),
    }),
  }),
  defineProviderAction("product_fruits", {
    name: "get_knowledge_base_category",
    operationType: "read",
    description: "Get a Product Fruits knowledge-base category by correlation ID.",
    inputSchema: s.requiredObject("Category lookup parameters.", {
      correlationId: s.nonEmptyString("Custom category correlation ID or internal ID prefixed with pf_."),
    }),
    outputSchema: categorySchema,
  }),
  defineProviderAction("product_fruits", {
    name: "list_knowledge_base_articles",
    operationType: "read",
    description: "List Product Fruits knowledge-base articles, optionally filtered by category.",
    inputSchema: s.object(
      "Article list filters.",
      {
        correlationCategoryId: s.nullable(
          s.nonEmptyString("Category correlation ID; use null to list only uncategorized root articles."),
        ),
      },
      { optional: ["correlationCategoryId"] },
    ),
    outputSchema: s.requiredObject("Product Fruits knowledge-base article list.", {
      articles: s.array("Knowledge-base article summaries.", articleSummarySchema),
    }),
  }),
  defineProviderAction("product_fruits", {
    name: "get_knowledge_base_article_content",
    operationType: "read",
    description: "Get localized Product Fruits knowledge-base article content as Markdown or HTML.",
    inputSchema: s.object(
      "Article content lookup parameters.",
      {
        correlationId: s.nonEmptyString("Custom article correlation ID or internal ID prefixed with pf_."),
        lang: s.nonEmptyString("Language code for the requested article content."),
        format: s.stringEnum("Requested article content format.", ["markdown", "html"]),
      },
      { optional: ["format"] },
    ),
    outputSchema: s.looseObject("Localized Product Fruits knowledge-base article content.", {
      articleId: s.number("Internal Product Fruits article ID."),
      articleCorrelationId: s.nullable(s.string("Article correlation ID when assigned.")),
      contentId: s.number("Internal content entry ID."),
      contentCorrelationId: s.nullable(s.string("Content entry correlation ID when assigned.")),
      lang: s.string("Language code of the returned content."),
      title: s.string("Localized article title."),
      slug: s.string("Localized article URL slug."),
      keywords: s.string("Article keywords."),
      lead: s.string("Article lead or short description."),
      published: s.boolean("Whether the article content is published."),
      lastModified: s.string("ISO 8601 timestamp of the latest modification."),
      format: s.stringEnum("Format of the returned content.", ["markdown", "html"]),
      content: s.string("Article content in the requested format."),
      conversionResults: s.array("Conversion notes for Markdown rendering.", conversionResultSchema),
    }),
  }),
];
