export const githubReadUserScope = "read:user";
export const githubUserEmailScope = "user:email";
export const githubRepoScope = "repo";
export const githubWorkflowScope = "workflow";
export const githubDeleteRepoScope = "delete_repo";

export const githubUserReadScopes: string[] = [githubReadUserScope, githubUserEmailScope];
export const githubRepoScopes: string[] = [githubRepoScope];
export const githubWorkflowScopes: string[] = [githubWorkflowScope];
export const githubDeleteRepoScopes: string[] = [githubDeleteRepoScope];

export const githubOAuthScopes: string[] = [
  githubReadUserScope,
  githubUserEmailScope,
  githubRepoScope,
  githubWorkflowScope,
  githubDeleteRepoScope,
];
