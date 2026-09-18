import type { ProviderActionDefinition } from "../../core/provider-definition.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

export const maidalvAction: ProviderActionDefinition = defineProviderAction("linkfox", {
  name: "check_product_tro_risk",
  operationType: "read",
  description:
    "Check product images and text for TRO, trademark, copyright, and patent risk through LinkFox and Maidalv.",
  inputSchema: s.object("Product TRO and intellectual-property risk detection parameters.", {
    mainProductImage: s.nonEmptyString(
      "The public main image URL or image Base64 data URI. URLs are recommended; maximum 1000 characters.",
      { pattern: "^(https?://|data:image/[^;]+;base64,)", maxLength: 1000 },
    ),
    referenceImages: s.optional(
      s.array(
        "Reference images.",
        s.string("A public image URL or image Base64 data URI.", {
          pattern: "^(https?://|data:image/[^;]+;base64,)",
        }),
        { maxItems: 3 },
      ),
    ),
    otherProductImages: s.optional(
      s.array(
        "Additional product images.",
        s.string("A public image URL or image Base64 data URI.", {
          pattern: "^(https?://|data:image/[^;]+;base64,)",
        }),
        { maxItems: 5 },
      ),
    ),
    ipImages: s.optional(
      s.array(
        "Intellectual-property reference images.",
        s.string("A public image URL or image Base64 data URI.", {
          pattern: "^(https?://|data:image/[^;]+;base64,)",
        }),
        { maxItems: 3 },
      ),
    ),
    referenceText: s.optional(s.string("Text from a similar product.", { maxLength: 1000 })),
    description: s.optional(s.string("The product description; a product title is recommended.", { maxLength: 1000 })),
    ipKeywords: s.optional(
      s.array("Intellectual-property keywords to investigate.", s.string("An array entry."), {
        maxItems: 20,
      }),
    ),
    language: s.optional({
      ...s.stringEnum("The language of report fields only.", ["zh", "en"]),
      default: "zh",
    }),
  }),
  outputSchema: s.looseRequiredObject("Maidalv TRO risk results, including high-risk and lower-risk IP items.", {
    status: s.optional(s.string("The analysis status.")),
    checkId: s.optional(s.string("The unique detection identifier.")),
    riskLevel: s.optional(s.string("The overall risk assessment.")),
    total: s.integer("The number of high-risk items in results."),
    results: s.array(
      "High-risk potential infringement items.",
      s.looseObject("An IP risk item; case and scoring fields may be absent.", {
        ipType: s.string("The IP type: Trademark, Copyright, or Patent."),
        text: s.string("The trademark text, patent title, or copyright title."),
        ipOwner: s.string("The intellectual-property owner."),
        regNo: s.string("The registration number; may contain a JSON-encoded array."),
        riskLevel: s.string("The item risk level when scored."),
        riskScore: s.number("The risk score from 0 to 10 when available.", {
          minimum: 0,
          maximum: 10,
        }),
        riskDescription: s.string("The risk explanation when scored."),
        ipAssetUrls: s.array("IP evidence image URLs.", s.string("An array entry.")),
        plaintiffId: s.integer("The TRO plaintiff ID when a related case exists."),
        plaintiffName: s.string("The TRO plaintiff name when a related case exists."),
        numberOfCases: s.nullableInteger("The plaintiff case count, or null when case details are unavailable."),
        lastCaseDocket: s.nullableString("The latest court docket, or null when unavailable."),
        lastCaseDateFiled: s.nullableString("The latest case filing date, or null when unavailable."),
        report: s.string("The AI-generated legal assessment in the requested report language."),
      }),
    ),
    nonResults: s.array(
      "Lower-risk or lower-similarity IP items, possibly including TRO case information.",
      s.looseObject("An IP risk item; case and scoring fields may be absent.", {
        ipType: s.string("The IP type: Trademark, Copyright, or Patent."),
        text: s.string("The trademark text, patent title, or copyright title."),
        ipOwner: s.string("The intellectual-property owner."),
        regNo: s.string("The registration number; may contain a JSON-encoded array."),
        riskLevel: s.string("The item risk level when scored."),
        riskScore: s.number("The risk score from 0 to 10 when available.", {
          minimum: 0,
          maximum: 10,
        }),
        riskDescription: s.string("The risk explanation when scored."),
        ipAssetUrls: s.array("IP evidence image URLs.", s.string("An array entry.")),
        plaintiffId: s.integer("The TRO plaintiff ID when a related case exists."),
        plaintiffName: s.string("The TRO plaintiff name when a related case exists."),
        numberOfCases: s.nullableInteger("The plaintiff case count, or null when case details are unavailable."),
        lastCaseDocket: s.nullableString("The latest court docket, or null when unavailable."),
        lastCaseDateFiled: s.nullableString("The latest case filing date, or null when unavailable."),
        report: s.string("The AI-generated legal assessment in the requested report language."),
      }),
    ),
    columns: s.optional(s.array("Supplier display columns.", s.looseObject("A display column.", {}))),
    type: s.optional(s.string("The supplier display type.")),
    costToken: s.optional(s.number("The LinkFox token usage when returned.")),
  }),
});
