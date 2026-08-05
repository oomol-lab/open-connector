import type { MondayProviderActionInput } from "./runtime-common.ts";
import type { MondayActionHandler } from "./runtime-common.ts";

import { compactObject } from "../../core/cast.ts";
import {
  asArray,
  mondayGraphqlRequest,
  normalizeMondayAsset,
  normalizeMondayDeleteDocResult,
  normalizeMondayDoc,
  normalizeMondayDocNameResult,
  normalizeMondayReply,
  normalizeMondayUpdate,
} from "./runtime-common.ts";

export const mondayCollaborationActionHandlers: Record<string, MondayActionHandler> = {
  list_updates(input, fetcher) {
    return mondayListUpdates(input, fetcher);
  },
  list_update_replies(input, fetcher) {
    return mondayListUpdateReplies(input, fetcher);
  },
  create_update(input, fetcher) {
    return mondayCreateUpdate(input, fetcher);
  },
  edit_update(input, fetcher) {
    return mondayEditUpdate(input, fetcher);
  },
  delete_update(input, fetcher) {
    return mondayDeleteUpdate(input, fetcher);
  },
  list_docs(input, fetcher) {
    return mondayListDocs(input, fetcher);
  },
  create_doc(input, fetcher) {
    return mondayCreateDoc(input, fetcher);
  },
  update_doc_name(input, fetcher) {
    return mondayUpdateDocName(input, fetcher);
  },
  delete_doc(input, fetcher) {
    return mondayDeleteDoc(input, fetcher);
  },
  list_assets(input, fetcher) {
    return mondayListAssets(input, fetcher);
  },
};

async function mondayListUpdates(input: MondayProviderActionInput, fetcher: typeof fetch) {
  const source = input.input;
  const payload = await mondayGraphqlRequest<{
    updates?: Array<Record<string, unknown>>;
  }>(
    input.apiKey,
    {
      query: `
        query ListUpdates($limit: Int, $page: Int, $from_date: Date, $to_date: Date) {
          updates(limit: $limit, page: $page, from_date: $from_date, to_date: $to_date) {
            id
            body
            created_at
            updated_at
            creator {
              id
              name
              email
            }
          }
        }
      `,
      // `since`/`until` are the declared input names; monday's own arguments are
      // `from_date`/`to_date`, so the mapping happens here rather than in the schema.
      variables: compactObject({
        limit: typeof source.limit === "number" ? source.limit : undefined,
        page: typeof source.page === "number" ? source.page : undefined,
        from_date: typeof source.since === "string" ? source.since : undefined,
        to_date: typeof source.until === "string" ? source.until : undefined,
      }),
    },
    fetcher,
    "execute",
  );

  return {
    updates: asArray(payload.updates).map((update) => normalizeMondayUpdate(update)),
  };
}

async function mondayListUpdateReplies(input: MondayProviderActionInput, fetcher: typeof fetch) {
  const source = input.input;
  const payload = await mondayGraphqlRequest<{
    replies?: Array<Record<string, unknown>>;
  }>(
    input.apiKey,
    {
      query: `
        query ListUpdateReplies(
          $board_ids: [ID!]!
          $created_at_from: String
          $created_at_to: String
          $limit: Int
          $page: Int
        ) {
          replies(
            board_ids: $board_ids
            created_at_from: $created_at_from
            created_at_to: $created_at_to
            limit: $limit
            page: $page
          ) {
            id
            body
            created_at
            edited_at
            kind
            creator {
              id
              name
              email
            }
          }
        }
      `,
      variables: compactObject({
        board_ids: source.board_ids,
        created_at_from: typeof source.created_at_from === "string" ? source.created_at_from : undefined,
        created_at_to: typeof source.created_at_to === "string" ? source.created_at_to : undefined,
        limit: typeof source.limit === "number" ? source.limit : undefined,
        page: typeof source.page === "number" ? source.page : undefined,
      }),
    },
    fetcher,
    "execute",
  );

  return {
    replies: asArray(payload.replies).map((reply) => normalizeMondayReply(reply)),
  };
}

async function mondayCreateUpdate(input: MondayProviderActionInput, fetcher: typeof fetch) {
  const source = input.input;
  const payload = await mondayGraphqlRequest<{
    create_update?: Record<string, unknown>;
  }>(
    input.apiKey,
    {
      query: `
        mutation CreateUpdate($item_id: ID, $parent_id: ID, $body: String!) {
          create_update(item_id: $item_id, parent_id: $parent_id, body: $body) {
            id
            body
            created_at
            updated_at
          }
        }
      `,
      variables: compactObject({
        item_id: source.item_id,
        parent_id: source.parent_id,
        body: source.body,
      }),
    },
    fetcher,
    "execute",
  );

  return {
    update: normalizeMondayUpdate(payload.create_update),
  };
}

async function mondayEditUpdate(input: MondayProviderActionInput, fetcher: typeof fetch) {
  const source = input.input;
  const payload = await mondayGraphqlRequest<{
    edit_update?: Record<string, unknown>;
  }>(
    input.apiKey,
    {
      query: `
        mutation EditUpdate($id: ID!, $body: String!) {
          edit_update(id: $id, body: $body) {
            id
            body
            created_at
            edited_at
            updated_at
          }
        }
      `,
      variables: {
        id: source.id,
        body: source.body,
      },
    },
    fetcher,
    "execute",
  );

  return {
    update: normalizeMondayUpdate(payload.edit_update),
  };
}

async function mondayDeleteUpdate(input: MondayProviderActionInput, fetcher: typeof fetch) {
  const source = input.input;
  const payload = await mondayGraphqlRequest<{
    delete_update?: Record<string, unknown>;
  }>(
    input.apiKey,
    {
      query: `
        mutation DeleteUpdate($id: ID!) {
          delete_update(id: $id) {
            id
          }
        }
      `,
      variables: {
        id: source.id,
      },
    },
    fetcher,
    "execute",
  );

  return {
    deletedUpdateId: normalizeMondayUpdate(payload.delete_update).id,
  };
}

async function mondayListDocs(input: MondayProviderActionInput, fetcher: typeof fetch) {
  const source = input.input;
  const payload = await mondayGraphqlRequest<{
    docs?: Array<Record<string, unknown>>;
  }>(
    input.apiKey,
    {
      query: `
        query ListDocs(
          $ids: [ID!]
          $object_ids: [ID!]
          $workspace_ids: [ID]
          $limit: Int
          $page: Int
          $order_by: DocsOrderBy
        ) {
          docs(
            ids: $ids
            object_ids: $object_ids
            workspace_ids: $workspace_ids
            limit: $limit
            page: $page
            order_by: $order_by
          ) {
            id
            object_id
            name
            doc_kind
            created_at
            updated_at
            url
            relative_url
            doc_folder_id
            settings
            created_by {
              id
              name
              email
            }
          }
        }
      `,
      variables: compactObject({
        ids: source.ids,
        object_ids: source.object_ids,
        workspace_ids: source.workspace_ids,
        limit: typeof source.limit === "number" ? source.limit : undefined,
        page: typeof source.page === "number" ? source.page : undefined,
        order_by: typeof source.order_by === "string" ? source.order_by : undefined,
      }),
    },
    fetcher,
    "execute",
  );

  return {
    docs: asArray(payload.docs).map((doc) => normalizeMondayDoc(doc)),
  };
}

async function mondayCreateDoc(input: MondayProviderActionInput, fetcher: typeof fetch) {
  const source = input.input;
  const payload = await mondayGraphqlRequest<{
    create_doc?: Record<string, unknown>;
  }>(
    input.apiKey,
    {
      query: `
        mutation CreateDoc($location: CreateDocInput!) {
          create_doc(location: $location) {
            id
            object_id
            name
            doc_kind
            url
          }
        }
      `,
      variables: {
        location: source.location,
      },
    },
    fetcher,
    "execute",
  );

  return {
    doc: normalizeMondayDoc(payload.create_doc),
  };
}

async function mondayUpdateDocName(input: MondayProviderActionInput, fetcher: typeof fetch) {
  const source = input.input;
  const payload = await mondayGraphqlRequest<{
    update_doc_name?: unknown;
  }>(
    input.apiKey,
    {
      query: `
        mutation UpdateDocName($docId: Int!, $name: String!) {
          update_doc_name(docId: $docId, name: $name)
        }
      `,
      variables: {
        docId: source.docId,
        name: source.name,
      },
    },
    fetcher,
    "execute",
  );

  return {
    updatedDocName: normalizeMondayDocNameResult(payload.update_doc_name),
  };
}

async function mondayDeleteDoc(input: MondayProviderActionInput, fetcher: typeof fetch) {
  const source = input.input;
  const payload = await mondayGraphqlRequest<{
    delete_doc?: unknown;
  }>(
    input.apiKey,
    {
      query: `
        mutation DeleteDoc($docId: ID!) {
          delete_doc(docId: $docId)
        }
      `,
      variables: {
        docId: source.docId,
      },
    },
    fetcher,
    "execute",
  );

  return normalizeMondayDeleteDocResult(payload.delete_doc);
}

async function mondayListAssets(input: MondayProviderActionInput, fetcher: typeof fetch) {
  const source = input.input;
  const payload = await mondayGraphqlRequest<{
    assets?: Array<Record<string, unknown>>;
  }>(
    input.apiKey,
    {
      query: `
        query ListAssets($ids: [ID!]!) {
          assets(ids: $ids) {
            id
            name
            url
            public_url
            file_extension
            file_size
            created_at
            url_thumbnail
            uploaded_by {
              id
              name
              email
            }
          }
        }
      `,
      variables: {
        ids: source.ids,
      },
    },
    fetcher,
    "execute",
  );

  return {
    assets: asArray(payload.assets).map((asset) => normalizeMondayAsset(asset)),
  };
}
