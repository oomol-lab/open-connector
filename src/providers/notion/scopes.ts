export const notionReadContentCapability = "read_content";
export const notionInsertContentCapability = "insert_content";
export const notionUpdateContentCapability = "update_content";

export const notionReadScopes: string[] = [notionReadContentCapability];
export const notionWriteScopes: string[] = [
  notionInsertContentCapability,
  notionUpdateContentCapability,
];
