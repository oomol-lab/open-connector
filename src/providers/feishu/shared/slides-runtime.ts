import type { FeishuJsonRequest } from "./client.ts";

import { optionalRecord, optionalString, optionalStringArray } from "../../../core/cast.ts";
import { providerInputError, ProviderRequestError } from "../../provider-runtime.ts";

interface FeishuSlidesActionHandler {
  (input: Record<string, unknown>): Promise<unknown>;
}

interface SlideReplacement {
  readonly slideId: string;
  readonly content: string;
}

export function createFeishuSlidesActionHandlers(
  request: FeishuJsonRequest,
): Record<string, FeishuSlidesActionHandler> {
  return {
    create_slides_presentation(input) {
      return createSlidesPresentation(input, request);
    },
    get_slides_presentation(input) {
      return getSlidesPresentation(input, request);
    },
    get_slide(input) {
      return getSlide(input, request);
    },
    create_slide(input) {
      return createSlide(input, request);
    },
    delete_slide(input) {
      return deleteSlide(input, request);
    },
    replace_slide_elements(input) {
      return replaceSlideElements(input, request);
    },
    replace_slides(input) {
      return replaceSlides(input, request);
    },
    list_slides_history(input) {
      return listSlidesHistory(input, request);
    },
    revert_slides_history(input) {
      return revertSlidesHistory(input, request);
    },
    get_slides_revert_status(input) {
      return getSlidesRevertStatus(input, request);
    },
  };
}

async function createSlidesPresentation(input: Record<string, unknown>, request: FeishuJsonRequest) {
  const title = optionalString(input.title) ?? "Untitled";
  const slides = optionalStringArray(input.slides) ?? [];
  const data = await request({
    method: "POST",
    path: "/slides_ai/v1/xml_presentations",
    body: {
      xml_presentation: {
        content: createPresentationXml(title),
      },
    },
  });
  const presentationId = requireResponseString(data.xml_presentation_id, "xml_presentation_id");
  const slideIds: string[] = [];
  const issues: unknown[] = [];
  if (data.issues != null) {
    issues.push(data.issues);
  }
  let revisionId = optionalNumber(data.revision_id);
  for (const content of slides) {
    const slideData = await request({
      method: "POST",
      path: `/slides_ai/v1/xml_presentations/${encodeURIComponent(presentationId)}/slide`,
      query: {
        revision_id: revisionId ?? -1,
      },
      body: {
        slide: { content },
      },
    });
    const slideId = requireResponseString(slideData.slide_id, "slide_id");
    slideIds.push(slideId);
    revisionId = optionalNumber(slideData.revision_id) ?? revisionId;
    if (slideData.issues != null) {
      issues.push({
        slideId,
        issues: slideData.issues,
      });
    }
  }
  return {
    presentationId,
    title,
    revisionId,
    url: optionalString(data.url),
    slideIds,
    issues: issues.length > 0 ? issues : undefined,
  };
}

async function getSlidesPresentation(input: Record<string, unknown>, request: FeishuJsonRequest) {
  const presentationId = await resolvePresentationId(input, request);
  const data = await request({
    path: `/slides_ai/v1/xml_presentations/${encodeURIComponent(presentationId)}`,
    query: {
      revision_id: optionalNumber(input.revisionId) ?? -1,
      remove_attr_id: optionalBoolean(input.removeAttributeIds),
    },
  });
  return {
    presentationId,
    presentation: optionalRecord(data.xml_presentation) ?? data,
  };
}

async function getSlide(input: Record<string, unknown>, request: FeishuJsonRequest) {
  const presentationId = await resolvePresentationId(input, request);
  const slideId = optionalString(input.slideId);
  const slideNumber = optionalNumber(input.slideNumber);
  if ((!slideId && slideNumber == null) || (slideId && slideNumber != null)) {
    throw providerInputError("provide exactly one of slideId or slideNumber");
  }
  const data = await request({
    path: `/slides_ai/v1/xml_presentations/${encodeURIComponent(presentationId)}/slide`,
    query: {
      slide_id: slideId,
      slide_number: slideNumber,
      revision_id: optionalNumber(input.revisionId) ?? -1,
    },
  });
  return {
    presentationId,
    slide: optionalRecord(data.slide) ?? data,
    revisionId: optionalNumber(data.revision_id),
  };
}

async function createSlide(input: Record<string, unknown>, request: FeishuJsonRequest) {
  const presentationId = await resolvePresentationId(input, request);
  const data = await request({
    method: "POST",
    path: `/slides_ai/v1/xml_presentations/${encodeURIComponent(presentationId)}/slide`,
    query: {
      revision_id: optionalNumber(input.revisionId) ?? -1,
    },
    body: {
      slide: {
        content: requireString(input.content, "content"),
      },
      before_slide_id: optionalString(input.beforeSlideId),
    },
  });
  return normalizeSlideMutation(presentationId, data);
}

async function deleteSlide(input: Record<string, unknown>, request: FeishuJsonRequest) {
  const presentationId = await resolvePresentationId(input, request);
  const slideId = requireString(input.slideId, "slideId");
  const data = await request({
    method: "DELETE",
    path: `/slides_ai/v1/xml_presentations/${encodeURIComponent(presentationId)}/slide`,
    query: {
      slide_id: slideId,
      revision_id: optionalNumber(input.revisionId) ?? -1,
    },
  });
  return {
    presentationId,
    slideId,
    deleted: true,
    revisionId: optionalNumber(data.revision_id),
  };
}

async function replaceSlideElements(input: Record<string, unknown>, request: FeishuJsonRequest) {
  const presentationId = await resolvePresentationId(input, request);
  const slideId = requireString(input.slideId, "slideId");
  const parts = normalizeReplaceParts(input.parts);
  const data = await request({
    method: "POST",
    path: `/slides_ai/v1/xml_presentations/${encodeURIComponent(presentationId)}/slide/replace`,
    query: {
      slide_id: slideId,
      revision_id: optionalNumber(input.revisionId) ?? -1,
      tid: optionalString(input.transactionId),
    },
    body: { parts },
  });
  return {
    presentationId,
    slideId,
    partsCount: parts.length,
    revisionId: optionalNumber(data.revision_id),
    failedPartIndex: optionalNumber(data.failed_part_index),
    failedReason: optionalString(data.failed_reason),
  };
}

async function replaceSlides(input: Record<string, unknown>, request: FeishuJsonRequest) {
  const presentationId = await resolvePresentationId(input, request);
  const pages = readSlideReplacements(input.pages);
  let revisionId = optionalNumber(input.revisionId) ?? -1;
  const results: Array<{ oldSlideId: string; newSlideId: string }> = [];
  for (const page of pages) {
    const createData = await request({
      method: "POST",
      path: `/slides_ai/v1/xml_presentations/${encodeURIComponent(presentationId)}/slide`,
      query: { revision_id: revisionId },
      body: {
        slide: { content: page.content },
        before_slide_id: page.slideId,
      },
    });
    const newSlideId = requireResponseString(createData.slide_id, "slide_id");
    revisionId = optionalNumber(createData.revision_id) ?? revisionId;
    const deleteData = await request({
      method: "DELETE",
      path: `/slides_ai/v1/xml_presentations/${encodeURIComponent(presentationId)}/slide`,
      query: {
        slide_id: page.slideId,
        revision_id: revisionId,
      },
    });
    revisionId = optionalNumber(deleteData.revision_id) ?? revisionId;
    results.push({ oldSlideId: page.slideId, newSlideId });
  }
  return {
    presentationId,
    results,
    revisionId: revisionId >= 0 ? revisionId : undefined,
  };
}

async function listSlidesHistory(input: Record<string, unknown>, request: FeishuJsonRequest) {
  const presentationId = await resolvePresentationId(input, request);
  const data = await request({
    path: `/slides_ai/v1/xml_presentations/${encodeURIComponent(presentationId)}/histories`,
    query: {
      page_size: optionalNumber(input.pageSize) ?? 20,
      page_token: optionalString(input.pageToken),
    },
  });
  return {
    entries: Array.isArray(data.entries) ? data.entries : [],
    hasMore: data.has_more === true,
    pageToken: optionalString(data.page_token),
  };
}

async function revertSlidesHistory(input: Record<string, unknown>, request: FeishuJsonRequest) {
  const presentationId = await resolvePresentationId(input, request);
  const data = await request({
    method: "POST",
    path: `/slides_ai/v1/xml_presentations/${encodeURIComponent(presentationId)}/history/revert`,
    body: {
      history_version_id: requireString(input.historyVersionId, "historyVersionId"),
    },
  });
  return normalizeHistoryTask(data);
}

async function getSlidesRevertStatus(input: Record<string, unknown>, request: FeishuJsonRequest) {
  const presentationId = await resolvePresentationId(input, request);
  const data = await request({
    path: `/slides_ai/v1/xml_presentations/${encodeURIComponent(presentationId)}/history/revert_status`,
    query: {
      task_id: requireString(input.taskId, "taskId"),
    },
  });
  return normalizeHistoryTask(data);
}

async function resolvePresentationId(input: Record<string, unknown>, request: FeishuJsonRequest) {
  const token = requireString(input.presentationToken, "presentationToken");
  if ((optionalString(input.presentationType) ?? "slides") === "slides") {
    return token;
  }
  const data = await request({
    path: "/wiki/v2/spaces/get_node",
    query: { token },
  });
  const node = optionalRecord(data.node);
  const objectType = optionalString(node?.obj_type);
  const objectToken = optionalString(node?.obj_token);
  if (objectType !== "slides" || !objectToken) {
    throw providerInputError(`Wiki node must resolve to slides, received ${objectType ?? "unknown"}`);
  }
  return objectToken;
}

function normalizeReplaceParts(value: unknown) {
  if (!Array.isArray(value) || value.length === 0 || value.length > 200) {
    throw providerInputError("parts must contain between 1 and 200 items");
  }
  return value.map((item, index) => {
    const part = optionalRecord(item);
    const action = optionalString(part?.action);
    if (action === "block_replace") {
      const blockId = requireString(part?.blockId, `parts[${index}].blockId`);
      const replacement = ensureBlockReplacement(
        requireString(part?.replacement, `parts[${index}].replacement`),
        blockId,
      );
      return {
        action,
        block_id: blockId,
        replacement,
      };
    } else if (action === "block_insert") {
      return {
        action,
        insertion: ensureShapeContent(requireString(part?.insertion, `parts[${index}].insertion`)),
        insert_before_block_id: optionalString(part?.insertBeforeBlockId),
      };
    } else {
      throw providerInputError(`parts[${index}].action must be block_replace or block_insert`);
    }
  });
}

function ensureBlockReplacement(fragment: string, blockId: string) {
  const withContent = ensureShapeContent(fragment);
  const openingEnd = withContent.indexOf(">");
  if (!withContent.startsWith("<") || openingEnd < 1) {
    throw providerInputError("replacement must contain one XML root element");
  }
  const opening = withContent.slice(0, openingEnd);
  if (opening.includes(" id=")) {
    return withContent;
  }
  const insertionIndex = opening.endsWith("/") ? openingEnd - 1 : openingEnd;
  return `${withContent.slice(0, insertionIndex)} id="${escapeXml(blockId)}"${withContent.slice(insertionIndex)}`;
}

function ensureShapeContent(fragment: string) {
  const trimmed = fragment.trim();
  if (!trimmed.startsWith("<shape")) {
    return fragment;
  } else if (trimmed.includes("<content")) {
    return fragment;
  } else if (trimmed.endsWith("/>")) {
    return `${trimmed.slice(0, -2)}><content/></shape>`;
  } else {
    const closeIndex = trimmed.lastIndexOf("</shape>");
    return closeIndex < 0 ? fragment : `${trimmed.slice(0, closeIndex)}<content/>${trimmed.slice(closeIndex)}`;
  }
}

function readSlideReplacements(value: unknown): SlideReplacement[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw providerInputError("pages must contain at least one replacement");
  }
  const seen = new Set<string>();
  return value.map((item, index) => {
    const page = optionalRecord(item);
    const slideId = requireString(page?.slideId, `pages[${index}].slideId`);
    if (seen.has(slideId)) {
      throw providerInputError(`pages contains duplicate slideId ${slideId}`);
    }
    seen.add(slideId);
    return {
      slideId,
      content: requireString(page?.content, `pages[${index}].content`),
    };
  });
}

function normalizeSlideMutation(presentationId: string, data: Record<string, unknown>) {
  return {
    presentationId,
    slideId: requireResponseString(data.slide_id, "slide_id"),
    revisionId: optionalNumber(data.revision_id),
    issues: Array.isArray(data.issues) ? data.issues : undefined,
  };
}

function normalizeHistoryTask(data: Record<string, unknown>) {
  return {
    taskId: optionalString(data.task_id),
    status: optionalString(data.status),
    historyVersionId: optionalString(data.history_version_id),
    failedSlideIds: optionalStringArray(data.failed_slide_ids),
  };
}

function createPresentationXml(title: string) {
  return `<presentation xmlns="http://www.larkoffice.com/sml/2.0" width="960" height="540"><title>${escapeXml(title)}</title></presentation>`;
}

function escapeXml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function requireString(value: unknown, fieldName: string) {
  const string = optionalString(value);
  if (!string) {
    throw providerInputError(`${fieldName} is required`);
  }
  return string;
}

function requireResponseString(value: unknown, fieldName: string) {
  const string = optionalString(value);
  if (!string) {
    throw new ProviderRequestError(502, `Feishu Slides response is missing ${fieldName}`);
  }
  return string;
}

function optionalNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function optionalBoolean(value: unknown) {
  return typeof value === "boolean" ? value : undefined;
}
