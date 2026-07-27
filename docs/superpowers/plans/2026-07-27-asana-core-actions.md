# Asana Core Actions Expansion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expand the Asana provider from 10 to 101 locally executable core collaboration actions,
then replace and verify the user's existing local Docker container before opening a pull request.

**Architecture:** Split catalog definitions and runtime handlers by Asana resource while keeping
HTTP envelopes, pagination, errors, field conversion, and attachment transport in one shared
runtime. Compose concrete action arrays in `definition.ts` and concrete handler records in
`executors.ts`; do not add a barrel, generated provider schema, raw-request action, or
provider-local action-name type system.

**Tech Stack:** Node.js 24 native TypeScript, Vitest, JSON Schema helpers, SSRF-guarded provider
fetch, FormData/transit files, Docker Compose, GitHub CLI.

**Execution location:** The current `feat/asana-core-actions` branch in the primary working
directory. The user explicitly requested no git worktree.

---

## File Map

**Create**

- `src/providers/asana/schemas.ts` — shared resource, pagination, ID, mutation, and success schemas.
- `src/providers/asana/actions-workspaces.ts` — workspace actions.
- `src/providers/asana/actions-users.ts` — user actions.
- `src/providers/asana/actions-teams.ts` — team actions.
- `src/providers/asana/actions-projects.ts` — project and section actions.
- `src/providers/asana/actions-tasks.ts` — task actions.
- `src/providers/asana/actions-stories-tags.ts` — story/comment and tag actions.
- `src/providers/asana/actions-custom-fields.ts` — custom field and field-setting actions.
- `src/providers/asana/actions-attachments.ts` — attachment actions.
- `src/providers/asana/runtime.ts` — shared Asana HTTP protocol and handler helpers.
- `src/providers/asana/runtime-workspaces-users-teams.ts` — workspace, user, and team handlers.
- `src/providers/asana/runtime-projects-sections.ts` — project and section handlers.
- `src/providers/asana/runtime-tasks.ts` — task handlers.
- `src/providers/asana/runtime-stories-tags.ts` — story/comment and tag handlers.
- `src/providers/asana/runtime-custom-fields.ts` — custom field and setting handlers.
- `src/providers/asana/runtime-attachments.ts` — attachment handlers and multipart logic.
- `src/providers/asana/runtime.test.ts` — behavior tests using real handlers and a recording fetcher.

**Modify**

- `src/providers/asana/actions.ts` — retain shared existing mutation field definitions only while
  resource actions are migrated; remove it once all imports move to concrete action modules.
- `src/providers/asana/executors.ts` — credential wiring and handler composition only.
- `src/providers/asana/definition.ts` — compose resource action arrays without executor imports.

**Delete**

- `src/providers/asana/actions.ts` after all definitions have moved.

## Exact Action Inventory

Keep these existing names: `list_workspaces`, `get_workspace`, `list_projects`, `get_project`,
`create_project`, `update_project`, `list_project_tasks`, `get_task`, `create_task`, `update_task`.

Add the following 91 names:

- Workspaces: `update_workspace`, `add_workspace_user`, `remove_workspace_user`,
  `get_workspace_events`.
- Users: `list_users`, `get_user`, `update_user`, `list_user_favorites`, `list_team_users`,
  `list_workspace_users`, `get_workspace_user`, `update_workspace_user`.
- Teams: `create_team`, `get_team`, `update_team`, `list_workspace_teams`, `list_user_teams`,
  `add_team_user`, `remove_team_user`.
- Projects: `delete_project`, `duplicate_project`, `list_task_projects`, `list_team_projects`,
  `create_team_project`, `list_workspace_projects`, `create_workspace_project`,
  `search_workspace_projects`, `add_project_custom_field`, `remove_project_custom_field`,
  `get_project_task_counts`, `add_project_members`, `remove_project_members`,
  `add_project_followers`, `remove_project_followers`.
- Sections: `get_section`, `update_section`, `delete_section`, `list_project_sections`,
  `create_project_section`, `add_section_task`, `insert_project_section`.
- Tasks: `list_tasks`, `delete_task`, `duplicate_task`, `list_section_tasks`, `list_tag_tasks`,
  `list_user_task_list_tasks`, `list_subtasks`, `create_subtask`, `set_task_parent`,
  `list_task_dependencies`, `add_task_dependencies`, `remove_task_dependencies`,
  `list_task_dependents`, `add_task_dependents`, `remove_task_dependents`, `add_task_project`,
  `remove_task_project`, `add_task_tag`, `remove_task_tag`, `add_task_followers`,
  `remove_task_followers`, `get_task_by_custom_id`, `search_workspace_tasks`.
- Stories/comments: `get_story`, `update_story`, `delete_story`, `list_task_stories`,
  `create_task_story`.
- Tags: `list_tags`, `create_tag`, `get_tag`, `update_tag`, `delete_tag`, `list_task_tags`,
  `list_workspace_tags`, `create_workspace_tag`.
- Custom fields: `create_custom_field`, `get_custom_field`, `update_custom_field`,
  `delete_custom_field`, `list_workspace_custom_fields`, `create_custom_field_enum_option`,
  `insert_custom_field_enum_option`, `update_custom_field_enum_option`.
- Custom field settings: `list_project_custom_field_settings`,
  `list_team_custom_field_settings`.
- Attachments: `get_attachment`, `delete_attachment`, `list_attachments`,
  `create_attachment`.

## Task 1: Extract and Test the Shared Asana Runtime

**Files:**

- Create: `src/providers/asana/runtime.ts`
- Create: `src/providers/asana/runtime.test.ts`
- Modify: `src/providers/asana/executors.ts`

- [ ] **Step 1: Write the failing runtime protocol tests**

Create a recording `ApiKeyProviderContext` and tests that import the not-yet-created
`requestAsana`, `listAsanaResources`, `getAsanaResource`, `writeAsanaResource`, and
`deleteAsanaResource`. The tests must assert:

```ts
expect(recorded.method).toBe("POST");
expect(recorded.url.pathname).toBe("/api/1.0/tasks");
expect(recorded.url.searchParams.get("opt_fields")).toBe("name,notes");
expect(JSON.parse(recorded.body as string)).toEqual({ data: { name: "Ship" } });
expect(await response.json()).toEqual({ data: { gid: "task-1" } });
```

Also cover `next_page.offset -> nextCursor`, HTTP 204 deletion, first Asana
`errors[].message`, 401 validation mapping, 404 invalid-input mapping, 429 preservation,
non-JSON response rejection, and aborted fetch mapping to 504.

- [ ] **Step 2: Run the targeted test and verify RED**

Run:

```bash
npx vitest run src/providers/asana/runtime.test.ts
```

Expected: FAIL because `./runtime.ts` does not exist.

- [ ] **Step 3: Implement the shared runtime**

Move the existing request/envelope/error/pagination behavior out of `executors.ts`. Export these
concrete contracts:

```ts
export interface AsanaContext extends ApiKeyProviderContext {}

export interface AsanaRequestOptions {
  context: Pick<AsanaContext, "apiKey" | "fetcher" | "signal">;
  path: string;
  phase?: "validate" | "execute";
  method?: "GET" | "POST" | "PUT" | "DELETE";
  query?: Record<string, string | undefined>;
  body?: BodyInit | Record<string, unknown>;
  wrapData?: boolean;
  notFoundAsInvalidInput?: boolean;
}

export async function requestAsana(
  options: AsanaRequestOptions,
): Promise<Record<string, unknown>>;

export async function listAsanaResources(
  path: string,
  query: Record<string, string | undefined>,
  outputKey: string,
  context: AsanaContext,
): Promise<Record<string, unknown>>;

export async function getAsanaResource(
  path: string,
  query: Record<string, string | undefined>,
  outputKey: string,
  context: AsanaContext,
): Promise<Record<string, unknown>>;

export async function writeAsanaResource(
  path: string,
  body: Record<string, unknown>,
  outputKey: string,
  context: AsanaContext,
  method: "POST" | "PUT",
  query?: Record<string, string | undefined>,
): Promise<Record<string, unknown>>;

export async function deleteAsanaResource(
  path: string,
  context: AsanaContext,
): Promise<{ success: true }>;
```

`requestAsana` must use `context.fetcher`, preserve the bearer token and user agent, wrap JSON as
`{ data: body }`, send `FormData` without manually setting content type, accept 200/201/204, and
never call global `fetch`.

- [ ] **Step 4: Keep existing handlers green through imports**

Update `executors.ts` to import the shared functions while preserving all ten existing handler
names and credential validation behavior.

- [ ] **Step 5: Run RED-GREEN verification**

Run:

```bash
npx vitest run src/providers/asana/runtime.test.ts
npm run build
```

Expected: PASS, then exit 0.

- [ ] **Step 6: Commit**

```bash
git add src/providers/asana/runtime.ts src/providers/asana/runtime.test.ts src/providers/asana/executors.ts
git commit -m "refactor(asana): extract shared runtime"
```

## Task 2: Shared Schemas and Workspace, User, and Team Actions

**Files:**

- Create: `src/providers/asana/schemas.ts`
- Create: `src/providers/asana/actions-workspaces.ts`
- Create: `src/providers/asana/actions-users.ts`
- Create: `src/providers/asana/actions-teams.ts`
- Create: `src/providers/asana/runtime-workspaces-users-teams.ts`
- Modify: `src/providers/asana/runtime.test.ts`
- Modify: `src/providers/asana/executors.ts`
- Modify: `src/providers/asana/definition.ts`

- [ ] **Step 1: Write failing handler tests**

Add a table that executes each new handler and asserts its method and path:

```ts
const cases = [
  ["update_workspace", { workspaceId: "w1", name: "New" }, "PUT", "/workspaces/w1"],
  ["add_workspace_user", { workspaceId: "w1", user: "me" }, "POST", "/workspaces/w1/addUser"],
  ["remove_workspace_user", { workspaceId: "w1", user: "u1" }, "POST", "/workspaces/w1/removeUser"],
  ["get_workspace_events", { workspaceId: "w1", sync: "token" }, "GET", "/workspaces/w1/events"],
  ["list_users", { workspaceId: "w1" }, "GET", "/users"],
  ["get_user", { userId: "me" }, "GET", "/users/me"],
  ["update_user", { userId: "u1", name: "New" }, "PUT", "/users/u1"],
  ["list_user_favorites", { userId: "me", workspaceId: "w1", resourceType: "project" }, "GET", "/users/me/favorites"],
  ["list_team_users", { teamId: "t1" }, "GET", "/teams/t1/users"],
  ["list_workspace_users", { workspaceId: "w1" }, "GET", "/workspaces/w1/users"],
  ["get_workspace_user", { workspaceId: "w1", userId: "u1" }, "GET", "/workspaces/w1/users/u1"],
  ["update_workspace_user", { workspaceId: "w1", userId: "u1", name: "New" }, "PUT", "/workspaces/w1/users/u1"],
  ["create_team", { organizationId: "w1", name: "Core" }, "POST", "/teams"],
  ["get_team", { teamId: "t1" }, "GET", "/teams/t1"],
  ["update_team", { teamId: "t1", name: "Core" }, "PUT", "/teams/t1"],
  ["list_workspace_teams", { workspaceId: "w1" }, "GET", "/workspaces/w1/teams"],
  ["list_user_teams", { userId: "u1", organizationId: "w1" }, "GET", "/users/u1/teams"],
  ["add_team_user", { teamId: "t1", user: "u1" }, "POST", "/teams/t1/addUser"],
  ["remove_team_user", { teamId: "t1", user: "u1" }, "POST", "/teams/t1/removeUser"],
] as const;
```

Assert relevant query/body mappings such as `organization`, `resource_type`, `sync`, and
`{ data: { user: "u1" } }`.

- [ ] **Step 2: Verify RED**

Run `npx vitest run src/providers/asana/runtime.test.ts`.

Expected: FAIL because the resource handlers are missing.

- [ ] **Step 3: Implement shared schemas**

Export `gidField`, `includeFieldsSchema`, `paginationFields`, `nextCursorSchema`,
`successOutputSchema`, `resourceRefSchema`, and open resource schemas for workspace, user, team,
project, section, task, story, tag, attachment, custom field, enum option, and custom field
setting. Stable documented fields are explicit; nested variable fields use `s.looseObject`,
`s.record`, or `s.unknown` only at the flexible boundary.

- [ ] **Step 4: Implement the 21 workspace/user/team definitions**

Use `defineProviderAction` directly. Required scopes:

- `workspaces:read` for the two existing reads;
- `users:read` for user reads;
- `teams:read` for team reads;
- official write/delete scopes where the OpenAPI operation declares them;
- `[]` where the official operation currently has no granular OAuth scope.

Use pagination fields on collection endpoints and `includeFields` on endpoints supporting
`opt_fields`.

- [ ] **Step 5: Implement the 19 new handlers and preserve the 6 existing/overlapping handlers**

Build explicit `Record<string, AsanaActionHandler>` values. Use `encodeURIComponent` for each
path GID, `compactObject` for bodies, `compactStringObject` for queries, and require a non-empty
body for updates.

- [ ] **Step 6: Compose definitions and executors**

Import concrete action arrays into `definition.ts` and concrete handler records into
`executors.ts`; do not import `definition.ts` from runtime code.

- [ ] **Step 7: Verify GREEN and commit**

```bash
npx vitest run src/providers/asana/runtime.test.ts
npm run build
git add src/providers/asana
git commit -m "feat(asana): add workspace user and team actions"
```

Expected: tests pass, build exits 0, commit succeeds.

## Task 3: Project and Section Actions

**Files:**

- Create: `src/providers/asana/actions-projects.ts`
- Create: `src/providers/asana/runtime-projects-sections.ts`
- Modify: `src/providers/asana/runtime.test.ts`
- Modify: `src/providers/asana/executors.ts`
- Modify: `src/providers/asana/definition.ts`
- Modify: `src/providers/asana/actions.ts`

- [ ] **Step 1: Write failing project/section request tests**

Cover every special route:

```text
DELETE /projects/{project}
POST   /projects/{project}/duplicate
GET    /tasks/{task}/projects
GET    /teams/{team}/projects
POST   /teams/{team}/projects
GET    /workspaces/{workspace}/projects
POST   /workspaces/{workspace}/projects
GET    /workspaces/{workspace}/projects/search
POST   /projects/{project}/addCustomFieldSetting
POST   /projects/{project}/removeCustomFieldSetting
GET    /projects/{project}/task_counts
POST   /projects/{project}/addMembers
POST   /projects/{project}/removeMembers
POST   /projects/{project}/addFollowers
POST   /projects/{project}/removeFollowers
GET    /sections/{section}
PUT    /sections/{section}
DELETE /sections/{section}
GET    /projects/{project}/sections
POST   /projects/{project}/sections
POST   /sections/{section}/addTask
POST   /projects/{project}/sections/insert
```

Assert duplicate `include` and `schedule_dates`, project search dotted query keys, member/follower
arrays joined exactly as required by Asana, custom-field placement fields, and mutually exclusive
section insertion anchors.

- [ ] **Step 2: Verify RED**

Run `npx vitest run src/providers/asana/runtime.test.ts`.

Expected: FAIL for missing project/section handlers.

- [ ] **Step 3: Implement 26 project and section definitions**

Move the four existing project definitions without renaming them. Add the 15 project and 7 section
definitions from the exact inventory. Keep official scope metadata and strict input schemas,
including `anyOf` for update bodies and insertion anchors.

- [ ] **Step 4: Implement handlers**

Use shared list/get/write/delete runtime functions. Preserve existing create/update project date
range validation and default `opt_fields`. Normalize task-count responses under `taskCounts`,
sections under `sections`, and association removals under `success`.

- [ ] **Step 5: Verify GREEN and commit**

```bash
npx vitest run src/providers/asana/runtime.test.ts
npm run build
git add src/providers/asana
git commit -m "feat(asana): add project and section actions"
```

## Task 4: Complete Task Actions

**Files:**

- Create: `src/providers/asana/actions-tasks.ts`
- Create: `src/providers/asana/runtime-tasks.ts`
- Modify: `src/providers/asana/runtime.test.ts`
- Modify: `src/providers/asana/executors.ts`
- Modify: `src/providers/asana/definition.ts`
- Delete: `src/providers/asana/actions.ts`

- [ ] **Step 1: Write failing task handler tests**

Test all 27 task operations. In addition to the existing `get_task`, `create_task`, `update_task`,
and `list_project_tasks`, cover:

```text
GET    /tasks
DELETE /tasks/{task}
POST   /tasks/{task}/duplicate
GET    /sections/{section}/tasks
GET    /tags/{tag}/tasks
GET    /user_task_lists/{list}/tasks
GET    /tasks/{task}/subtasks
POST   /tasks/{task}/subtasks
POST   /tasks/{task}/setParent
GET    /tasks/{task}/dependencies
POST   /tasks/{task}/addDependencies
POST   /tasks/{task}/removeDependencies
GET    /tasks/{task}/dependents
POST   /tasks/{task}/addDependents
POST   /tasks/{task}/removeDependents
POST   /tasks/{task}/addProject
POST   /tasks/{task}/removeProject
POST   /tasks/{task}/addTag
POST   /tasks/{task}/removeTag
POST   /tasks/{task}/addFollowers
POST   /tasks/{task}/removeFollowers
GET    /workspaces/{workspace}/tasks/custom_id/{customId}
GET    /workspaces/{workspace}/tasks/search
```

Assert general-list filter requirements, task-search dotted keys and booleans, dependency arrays,
project/section placement fields, parent placement fields, custom-ID encoding, and pagination.

- [ ] **Step 2: Verify RED**

Run `npx vitest run src/providers/asana/runtime.test.ts`.

Expected: FAIL for missing task handlers.

- [ ] **Step 3: Implement 27 task definitions**

Preserve the four existing task action names and `list_project_tasks`. Expand `create_task` so the
existing `projectId` input remains supported while official `workspaceId`, `projectIds`,
`parentId`, `followerIds`, and `tagIds` inputs are available. Require a valid creation location:
`projectId`, non-empty `projectIds`, `workspaceId`, or `parentId`.

Use `tasks:read`, `tasks:write`, and `tasks:delete`. Represent search filters with clear camelCase
names mapped to Asana dotted query keys.

- [ ] **Step 4: Implement task handlers and move existing validation**

Move task date-range and mutually exclusive date/date-time validation from `executors.ts`.
Association mutations return the provider's task when present or `{ success: true }` for empty
records, matching each endpoint's documented response.

- [ ] **Step 5: Remove the old action module**

After `definition.ts` imports only concrete modules, delete `src/providers/asana/actions.ts`.
Confirm no import remains with:

```bash
rg -n 'asana/actions\\.ts|from "./actions\\.ts"' src/providers/asana src/providers/registry.generated.ts
```

Expected: no Asana match.

- [ ] **Step 6: Verify GREEN and commit**

```bash
npx vitest run src/providers/asana/runtime.test.ts
npm run build
git add src/providers/asana
git commit -m "feat(asana): complete task actions"
```

## Task 5: Story/Comment and Tag Actions

**Files:**

- Create: `src/providers/asana/actions-stories-tags.ts`
- Create: `src/providers/asana/runtime-stories-tags.ts`
- Modify: `src/providers/asana/runtime.test.ts`
- Modify: `src/providers/asana/executors.ts`
- Modify: `src/providers/asana/definition.ts`

- [ ] **Step 1: Write failing story and tag tests**

Verify the five story routes and eight tag routes. Story tests must prove:

- `get_story` fetches `/stories/{storyId}`;
- create accepts exactly one of `text` and `htmlText`;
- update accepts `text`, `htmlText`, or `isPinned`, requires at least one, and rejects both text
  forms together;
- delete returns `{ success: true }`;
- task story pagination returns `stories` plus `nextCursor`.

Tag tests cover generic and workspace creation, workspace/task listing, update, and deletion.

- [ ] **Step 2: Verify RED**

Run `npx vitest run src/providers/asana/runtime.test.ts`.

Expected: FAIL for missing handlers.

- [ ] **Step 3: Implement 13 definitions and handlers**

Story descriptions must include both “story” and “comment”. Use `stories:read`,
`stories:write`, and `stories:delete`. Tag schemas include `name`, `color`, `notes`, and
`workspaceId` where required, with official `tags:*` scopes when declared.

- [ ] **Step 4: Verify GREEN and commit**

```bash
npx vitest run src/providers/asana/runtime.test.ts
npm run build
git add src/providers/asana
git commit -m "feat(asana): add comment story and tag actions"
```

## Task 6: Custom Fields, Settings, and Attachments

**Files:**

- Create: `src/providers/asana/actions-custom-fields.ts`
- Create: `src/providers/asana/actions-attachments.ts`
- Create: `src/providers/asana/runtime-custom-fields.ts`
- Create: `src/providers/asana/runtime-attachments.ts`
- Modify: `src/providers/asana/runtime.test.ts`
- Modify: `src/providers/asana/executors.ts`
- Modify: `src/providers/asana/definition.ts`

- [ ] **Step 1: Write failing custom-field tests**

Cover create/get/update/delete/list, enum option create/insert/update, and project/team settings.
Assert:

```json
{
  "data": {
    "workspace": "w1",
    "name": "Priority",
    "resource_subtype": "enum",
    "enum_options": [{ "name": "High", "color": "red", "enabled": true }]
  }
}
```

Also assert insert before/after exclusivity and supported subtype-specific fields.

- [ ] **Step 2: Write failing attachment tests**

Cover get/list/delete and both create modes:

```ts
await handler(
  { parentId: "task-1", externalUrl: "https://files.example/report.pdf", name: "report.pdf" },
  context,
);
expect(JSON.parse(recorded.body as string)).toEqual({
  data: {
    parent: "task-1",
    url: "https://files.example/report.pdf",
    name: "report.pdf",
    resource_subtype: "external",
  },
});
```

For `fileId`, use a fake `TransitFileStore`, inspect the recorded `FormData`, and assert `parent`,
`file`, and optional `connect_to_app`. Add rejection tests for no mode, both modes, missing transit
store, file over 100 MB, credential-bearing URL, loopback, private IP, link-local, and metadata
targets.

- [ ] **Step 3: Verify RED**

Run `npx vitest run src/providers/asana/runtime.test.ts`.

Expected: FAIL for missing custom-field and attachment handlers.

- [ ] **Step 4: Implement ten custom-field definitions and handlers**

Use `custom_fields:read`/`write` and the project/team scopes for settings. Keep custom value
payloads flexible only where their subtype determines the shape.

- [ ] **Step 5: Implement four attachment definitions and handlers**

Use `assertPublicHttpUrl` for `externalUrl`. For transit files, read through
`context.transitFiles`, reject `sizeBytes > 100 * 1024 * 1024`, build `FormData`, and pass it to
`requestAsana` with `wrapData: false`. Do not manually set multipart content type and do not
download an external URL locally.

- [ ] **Step 6: Verify GREEN and commit**

```bash
npx vitest run src/providers/asana/runtime.test.ts
npm run build
git add src/providers/asana
git commit -m "feat(asana): add custom field and attachment actions"
```

## Task 7: Catalog Integration and Complete Code Verification

**Files:**

- Modify generated local catalog/registry through the generator only; ignored files must not be
  committed.

- [ ] **Step 1: Verify definition/handler parity**

Run:

```bash
node --input-type=module -e '
const [{ provider }, { asanaActionHandlers }] = await Promise.all([
  import("./src/providers/asana/definition.ts"),
  import("./src/providers/asana/executors.ts"),
]);
const actions = provider.actions.map((action) => action.name).sort();
const handlers = Object.keys(asanaActionHandlers).sort();
if (actions.length !== 101) throw new Error(`expected 101 actions, got ${actions.length}`);
if (JSON.stringify(actions) !== JSON.stringify(handlers)) {
  throw new Error(`definition/handler mismatch`);
}
console.log(`verified ${actions.length} Asana actions`);
'
```

Expected: `verified 101 Asana actions`.

- [ ] **Step 2: Generate catalog**

Run `npm run generate:catalog`.

Expected: exit 0; generated ignored files contain 101 Asana actions and lazy registry import remains
`import("./asana/executors.ts")`.

- [ ] **Step 3: Run repository-required verification**

```bash
npm run fix-check
npx vitest run src/providers/asana/runtime.test.ts
npm test
npm run build
git diff --check
```

Expected: every command exits 0 with no failing tests.

- [ ] **Step 4: Review the diff**

Run:

```bash
git status --short
git diff --stat origin/main...HEAD
git diff origin/main...HEAD -- src/providers/asana docs/superpowers
```

Confirm no generated catalog, third-party assets, global `fetch`, raw request action, barrel,
OAuth change, or out-of-scope resource family appears.

- [ ] **Step 5: Commit formatting-only changes if produced**

```bash
git add src/providers/asana docs/superpowers
git commit -m "chore(asana): finalize core action catalog"
```

Skip this commit when `git status --short` is empty.

## Task 8: Review, Replace the Local Docker Container, and Open the PR

**Files:**

- No source changes expected.
- Existing Compose configuration:
  `/Users/yangli/Desktop/jerry/open-connector/docker-compose.yml`
  and `/Users/yangli/Desktop/jerry/open-connector/docker-compose.override.yml`.

- [ ] **Step 1: Request code review**

Use `superpowers:requesting-code-review` against `origin/main...HEAD`. Fix every Critical or
Important issue, rerun Task 7 verification, and commit fixes before continuing.

- [ ] **Step 2: Resolve and preserve the exact current Docker target**

Run:

```bash
docker inspect open-connector-connector-1 --format '{{.Image}}'
docker volume inspect open-connector_connector-data
docker tag ghcr.io/oomol-lab/open-connector:latest open-connector:pre-asana-core
```

Record the old image ID. Do not remove the existing container, image, volume, or DNS sidecar
manually.

- [ ] **Step 3: Build the verified branch into the local image**

From this repository run:

```bash
docker compose -f docker-compose.yml -f docker-compose.build.yml build connector
```

Expected: exit 0 and `ghcr.io/oomol-lab/open-connector:latest` resolves to a new image ID.

- [ ] **Step 4: Recreate only the running connector service**

Run:

```bash
docker compose \
  -f /Users/yangli/Desktop/jerry/open-connector/docker-compose.yml \
  -f /Users/yangli/Desktop/jerry/open-connector/docker-compose.override.yml \
  --project-name open-connector \
  up -d --no-deps --force-recreate --pull never connector
```

Expected: `open-connector-connector-1` is recreated; `open-connector-doh-dns-1` and
`open-connector_connector-data` are preserved.

- [ ] **Step 5: Verify the replacement**

Poll Docker health in intervals shorter than 60 seconds until terminal:

```bash
docker inspect open-connector-connector-1 --format '{{.State.Health.Status}} {{.Image}}'
curl -fsS http://127.0.0.1:3100/health
docker inspect open-connector-connector-1 --format '{{range .Mounts}}{{.Name}}:{{.Destination}}{{end}}'
```

Expected: health is `healthy`, curl returns `{"ok":true}`, image ID matches the new build, and the
mount remains `open-connector_connector-data:/app/data`.

If verification fails, inspect logs, then recreate the connector from rollback without touching
the volume:

```bash
docker tag open-connector:pre-asana-core ghcr.io/oomol-lab/open-connector:latest
docker compose \
  -f /Users/yangli/Desktop/jerry/open-connector/docker-compose.yml \
  -f /Users/yangli/Desktop/jerry/open-connector/docker-compose.override.yml \
  --project-name open-connector \
  up -d --no-deps --force-recreate --pull never connector
```

- [ ] **Step 6: Push and create the pull request**

```bash
git push -u origin feat/asana-core-actions
gh pr create \
  --title "feat(asana): expand core collaboration actions" \
  --body-file /tmp/open-connector-asana-pr.md
```

The PR body must include:

- 101 total locally executable Asana actions and the covered resource families;
- explicit exclusions;
- comments represented by Asana story actions;
- attachment transit/public-URL security behavior;
- exact test/build commands and results;
- local Docker image/container IDs and health result;
- no provider example added and why.

- [ ] **Step 7: Inspect PR status**

Run:

```bash
gh pr view --web=false
gh pr checks
```

Report the PR URL and any pending or failing checks. Do not merge the PR.
