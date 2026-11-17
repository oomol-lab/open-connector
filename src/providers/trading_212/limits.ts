/**
 * Number of instruments search_instruments returns when the caller sets no
 * limit, shared by its schema and handler. Trading 212 returns its whole
 * instrument list in one response, so the action returns a short list an
 * agent can read.
 */
export const trading212DefaultInstrumentLimit = 25;
