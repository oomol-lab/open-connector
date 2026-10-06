// Gmail's upload ceiling applies to the complete MIME message, including encoding overhead.
export const gmailMaxMimeBytes = 35_000_000;
export const gmailMaxAttachmentBytes = 25_000_000;
// Bound per-message work independently of the byte budget.
export const gmailMaxAttachmentCount = 100;
