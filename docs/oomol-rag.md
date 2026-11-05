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

This provider exposes article authoring and retrieval. File-upload/conversion actions, image-asset upload, and the hosted connector's private file-transit download are not part of this initial Open Connector integration. Existing converted articles can still be edited. Markdown source strings must be converted to native BlockNote blocks by the caller before saving.
