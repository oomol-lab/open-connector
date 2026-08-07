export const microsoftTodoProviderScopes = {
  userRead: "User.Read",
  tasksRead: "Tasks.Read",
  tasksReadWrite: "Tasks.ReadWrite",
  offlineAccess: "offline_access",
} as const;

export const microsoftTodoReadScopes: string[] = [microsoftTodoProviderScopes.tasksRead];
export const microsoftTodoWriteScopes: string[] = [microsoftTodoProviderScopes.tasksReadWrite];
export const microsoftTodoOAuthScopes: string[] = [
  microsoftTodoProviderScopes.userRead,
  microsoftTodoProviderScopes.tasksReadWrite,
  microsoftTodoProviderScopes.offlineAccess,
];
