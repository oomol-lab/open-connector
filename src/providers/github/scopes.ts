export const githubReadUserScope = "read:user";
export const githubUserEmailScope = "user:email";
export const githubRepoScope = "repo";
export const githubWorkflowScope = "workflow";
export const githubDeleteRepoScope = "delete_repo";
// Needed for the Projects v2 actions in runtime-project.ts — github-mcp-server's
// "projects" toolset (see docs/features/github-projects-support/PLAN.md). Existing
// connections made before this scope was added will need to reconnect before those
// actions succeed; the scope is additive and does not change what any existing action
// can do.
export const githubProjectScope = "project";

export const githubUserReadScopes: string[] = [githubReadUserScope, githubUserEmailScope];
export const githubRepoScopes: string[] = [githubRepoScope];
export const githubWorkflowScopes: string[] = [githubWorkflowScope];
export const githubDeleteRepoScopes: string[] = [githubDeleteRepoScope];
export const githubProjectScopes: string[] = [githubProjectScope];

export const githubOAuthScopes: string[] = [
  githubReadUserScope,
  githubUserEmailScope,
  githubRepoScope,
  githubWorkflowScope,
  githubDeleteRepoScope,
  githubProjectScope,
];
