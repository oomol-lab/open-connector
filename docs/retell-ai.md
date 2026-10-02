# Retell AI agent list migration

`retell_ai.list_voice_agents` uses Retell's unified agent list API after the
[legacy endpoints were removed](https://docs.retellai.com/deprecation-notice/2026/07-31_agent_list_endpoints).
It selects the voice channel and returns one summary per agent.

## Inputs and pagination

Pass `limit`, `sortOrder` (`ascending` or `descending`), and `paginationKey` as needed.
Start without a cursor. While `hasMore` is true, pass the returned `paginationKey`
to the next call, keeping the other inputs unchanged. Cursors are opaque strings.

Remove `paginationKeyVersion` and `isLatest` from existing inputs. The new endpoint
lists unique agents rather than agent versions; those options have no equivalent.

## Outputs

`agents` contains `agentId`, `agentName`, `channel`, `userModifiedTimestamp`,
`tags`, and each item's `raw` object. The top-level `raw` is now the upstream page
object (`items`, `has_more`, and optional `pagination_key`), replacing the old array.
Use `agents` for normalized results or `raw.items` for upstream records.

The list no longer returns `version`, `voiceId`, `isPublished`, or
`lastModificationTimestamp`. Call `retell_ai.get_voice_agent` with an `agentId`
and optional `version` to retrieve those details. A version can be numeric,
`latest`, `latest_published`, or a tag. `userModifiedTimestamp` describes the
agent's user modification time, while the detail response's
`lastModificationTimestamp` belongs to the selected version.

See the official [list](https://docs.retellai.com/api-references/list-agents) and
[detail](https://docs.retellai.com/api-references/get-agent) contracts.
