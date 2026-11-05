# OOMOL RAG articles

The `oomol_rag` provider connects a self-hosted Open Connector instance to an OOMOL team's knowledge base. Add an API-key connection with your OOMOL API key and the team's **ID**, not its display name. Connection validation reads one article metadata page and never creates content. All requests use that connection's team scope; action parameters cannot change it.

The provider supports `create_article`, `list_articles`, `get_article`, `save_article_draft`, `publish_article`, `wait_for_article_ready`, `delete_article`, and `retrieve`. The article action names and input/output fields match the hosted OOMOL connector. Open Connector uses its own credential store and asynchronous-action metadata.

## Write a draft

1. Generate a stable article ID (a UUID is suitable) and call `create_article` with `articleId` and `title`. Retrying the same ID returns the existing article without overwriting it.
2. Call `save_article_draft` with the returned `revision`, a new stable `saveId`, the title, and native BlockNote content. Reuse the exact save ID and payload if the request outcome is unknown.
3. Read the result with `get_article`. Saving does not publish to retrieval.

Example save input:

```json
{
  "articleId": "example-article",
  "revision": 1,
  "saveId": "example-save-1",
  "title": "Knowledge guide",
  "content": {
    "type": "blocknote",
    "blocks": [
      {
        "id": "intro",
        "type": "paragraph",
        "content": [{ "type": "text", "text": "The guide starts here.", "styles": {} }],
        "children": []
      }
    ]
  }
}
```

For an existing article, first read its body and `formatVersion`. Version 3 uses BlockNote. Preserve existing blocks and IDs; do not reinterpret legacy editor content as BlockNote. On a 409 revision conflict, read and reconcile the changes before another save. Do not replace a stale revision number and blindly resubmit the stale body.

## Publish and retrieve

Call `publish_article` with `articleId`, the saved `revision`, and a stable `publishId` when publication is intended. A retry uses the same revision and publication ID. Poll `wait_for_article_ready` about every 15 seconds until `article.syncStatus` is `ready`; stop on `failed` or `uncertain`. Each call polls once. For a particular publication, compare `syncRevision` with the revision you requested. A newer draft can exist while the previous revision is ready in the index.

Use `retrieve` with a `query` to obtain matching passages. Hits include `articleId` when they belong to an editable article. Publishing a revision replaces that article's previous index asynchronously.

`delete_article` deletes the article and excludes its index from retrieval. Index cleanup is asynchronous, and any original file used for conversion is preserved.

This provider exposes article authoring and retrieval. File-upload/conversion actions, image-asset upload, and the hosted connector's private file-transit download are not part of this initial Open Connector integration. Existing converted articles can still be edited. Markdown input is accepted by `create_article_from_markdown` and `save_article_markdown`.

### Write directly from Markdown

Use `create_article_from_markdown` with `articleId`, `saveId`, `title`, and `markdown` to create a draft in one connector action. Creation and saving are separate API requests: conversion is validated before creation, but a later save failure may leave an empty draft. Retry the same article ID, save ID and exact payload to resume; do not generate another article ID. An existing edited article is protected by revision checking.

Use `save_article_markdown` with `articleId`, the latest `revision`, a new stable `saveId`, `title`, and `markdown` to **replace the entire body**. This is not append or patch. Blocks and images absent from the Markdown are removed from the draft. An empty Markdown string clears the body. Preserve leading spaces for indented code, and use JSON `@file` input for multiline source. For precise edits to existing BlockNote blocks or private assets, use the native `save_article_draft` action instead.

```json
{
  "articleId": "<stable article ID>",
  "saveId": "<stable save ID>",
  "title": "Markdown guide",
  "markdown": "# Guide\n\n- First step\n- [x] Finished\n\n**Important:** save before publishing."
}
```

Supported: headings 1–6, paragraphs, bold/italic/strikethrough, inline and fenced/indented code, links and reference links, ordered/nested/task lists, blockquotes, GFM tables and horizontal rules. Standalone HTTP(S) images become image blocks; inline images become links with a warning. HTML and unsupported/relative URLs remain literal text; conversion does not fetch remote resources. Review the returned `warnings` before publishing. Limits: 200,000 source characters, 1 MiB converted content, bounded nesting and table dimensions.

Both Markdown actions save a BlockNote format-3 draft. They never publish implicitly; use the existing publication workflow with the returned article revision when publication is requested.

### Edit individual blocks without replacing the article

Read `get_article` to obtain the current `revision` and block IDs (including nested `children`). Call `patch_article_blocks` with `articleId`, that revision, a stable `saveId`, and ordered `operations`. The backend applies the whole batch in one transaction, increments the revision once, and retains the article title. Any invalid or missing target rolls back every operation.

```json
{
  "articleId": "<article ID>",
  "revision": 3,
  "saveId": "<stable patch ID>",
  "operations": [
    {"op": "update", "blockId": "paragraph-1", "props": {"textAlignment": "center"}},
    {"op": "insert", "position": "after", "blockId": "paragraph-1", "blocks": [
      {"id": "new-paragraph", "type": "paragraph", "content": [{"type": "text", "text": "Added paragraph", "styles": {}}]}
    ]},
    {"op": "delete", "blockId": "obsolete-block"}
  ]
}
```

`update` merges only provided property keys. Omit `content` to preserve text and inline formatting; if supplied, it replaces only the selected block's inline/table content and should include the desired inline styles. The block's ID, type and children cannot be overwritten through an update. Other blocks, images, tables and formatting remain intact.

`insert` accepts `before`/`after` with a sibling `blockId`, or `start`/`end` with an optional `parentId` for children (omit it for root placement). Every inserted block and nested child needs a new, stable ID unique within the article. Later operations can target those new IDs. IDs deleted in the same batch cannot be reused. `delete` removes the target and its entire subtree; it does not remove other blocks or their image assets.

Use 1–100 operations on a format-3 BlockNote article. Retry the exact same original revision, save ID and operations after an uncertain response. Different payloads with the same save ID conflict. On a version conflict, read and reconcile before creating a new patch intent; never silently replace the revision. Saving a patch does not publish; use `publish_article` when knowledge-base synchronization is requested.
