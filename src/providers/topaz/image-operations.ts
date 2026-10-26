import type { JsonSchema } from "../../core/types.ts";

import { readSchemaProperties, jsonSchema as s } from "../../core/json-schema.ts";
import { imageInput } from "./schemas.ts";
export const imageOperations: {
  name: string;
  path: string;
  model: string;
  sizing: boolean;
  png: boolean;
  description: string;
}[] = [
  {
    name: "submit_image_enhancement",
    path: "enhance",
    model: "Standard V2",
    sizing: true,
    png: false,
    description: "Submit a precision image upscale job to Topaz. Returns a job ID for polling.",
  },
  {
    name: "submit_generative_image_enhancement",
    path: "enhance-gen",
    model: "Redefine",
    sizing: true,
    png: false,
    description: "Submit a generative image enhancement job to Topaz. Returns a job ID for polling.",
  },
  {
    name: "submit_image_sharpening",
    path: "sharpen",
    model: "Standard",
    sizing: false,
    png: false,
    description: "Submit image sharpening to restore sharpness and reduce blur.",
  },
  {
    name: "submit_generative_image_sharpening",
    path: "sharpen-gen",
    model: "Super Focus V2",
    sizing: false,
    png: false,
    description: "Submit generative image sharpening for severe blur recovery.",
  },
  {
    name: "submit_image_denoising",
    path: "denoise",
    model: "Normal",
    sizing: false,
    png: false,
    description: "Submit image denoising to remove noise while retaining detail.",
  },
  {
    name: "submit_image_restoration",
    path: "restore-gen",
    model: "Dust-Scratch",
    sizing: false,
    png: false,
    description: "Submit generative photo restoration to remove dust and scratches.",
  },
  {
    name: "submit_image_lighting",
    path: "lighting",
    model: "Adjust",
    sizing: false,
    png: false,
    description: "Submit image lighting, white balance or colorization processing.",
  },
  {
    name: "submit_image_matting",
    path: "matting",
    model: "Object",
    sizing: false,
    png: true,
    description: "Submit image object matting and return a PNG with transparency.",
  },
  {
    name: "submit_image_tool",
    path: "tool",
    model: "Transparency Upscale",
    sizing: true,
    png: true,
    description: "Submit transparency-preserving image upscaling using the Tool API.",
  },
];
export const imageOperationByName: Map<
  string,
  { name: string; path: string; model: string; sizing: boolean; png: boolean; description: string }
> = new Map(imageOperations.map((operation) => [operation.name, operation]));
export function imageOperationInput(operation: {
  path: string;
  model: string;
  sizing: boolean;
  png: boolean;
}): JsonSchema {
  const properties = Object.fromEntries(
    Object.entries(readSchemaProperties(imageInput)).filter(
      ([key]) => operation.sizing || !["outputWidth", "outputHeight", "cropToFill"].includes(key),
    ),
  );
  properties.model = s.string(`Official model name for ${operation.path}. Defaults to ${operation.model}.`, {
    minLength: 1,
  });
  if (operation.png) properties.outputFormat = s.stringEnum("Output format. This endpoint only supports PNG.", ["png"]);
  return s.object(String(imageInput.description), properties, {
    optional: Object.keys(properties),
    oneOf: [{ required: ["imageUrl"] }, { required: ["sourceId"] }],
  });
}
