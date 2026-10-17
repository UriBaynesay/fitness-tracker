// Ids are made on the phone so a workout can be created and synced later without the
// server's help. randomUUID needs a secure context (HTTPS or localhost), which the app
// always runs in.
export const newId = (): string => crypto.randomUUID();
