# Provider Coverage

This repository currently contains:

- 1,000+ providers
- 9,487 prebuilt Actions

OpenConnector, OOMOL, and Wanta share this provider coverage. The repository count and Action total
are counted from `src/providers`. Recount them with:

```bash
node --input-type=module <<'NODE'
import { readdir } from "node:fs/promises";

const entries = await readdir("src/providers", { withFileTypes: true });
const services = entries
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort((a, b) => a.localeCompare(b));

let actions = 0;
for (const service of services) {
  const module = await import(`./src/providers/${service}/definition.ts`);
  actions += module.provider.actions.length;
}

console.log(`${services.length} providers, ${actions} Actions`);
NODE
```

Representative providers include GitHub, Gmail, Notion, Google BigQuery, Google Analytics,
Supabase, Airtable, Slack, Google Drive, Google Sheets, Google Calendar, Postman, GitLab, and many
more.

---

# Provider 覆盖

当前仓库包含：

- 1,000+ 个 provider
- 9,487 个预置 Action

OpenConnector、OOMOL 和 Wanta 共享同一套 provider 覆盖。仓库内的 provider 数和 Action 总数来自
`src/providers`，可以使用上面的命令重新统计。

代表性 provider 包括 GitHub、Gmail、Notion、Google BigQuery、Google Analytics、Supabase、Airtable、
Slack、Google Drive、Google Sheets、Google Calendar、Postman、GitLab 等。
