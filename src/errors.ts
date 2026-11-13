/**
 * Error taxonomy shared by services and UI.
 *
 * Services throw these typed errors instead of formatting user-facing text;
 * ui/messages.ts maps them to Russian messages in one place. This keeps
 * services free of presentation concerns (Single Responsibility) and makes
 * the mapping exhaustive and greppable.
 */

/** Non-2xx response from the Gemini API. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly body: string,
  ) {
    super(`api_error_${status}`);
    this.name = 'ApiError';
  }
}

/** The API answered 200 but the payload was not parseable JSON. */
export class BadJsonError extends Error {
  constructor() {
    super('bad_json');
    this.name = 'BadJsonError';
  }
}

/** The model returned an empty response. */
export class EmptyResponseError extends Error {
  constructor() {
    super('empty_response');
    this.name = 'EmptyResponseError';
  }
}

/** Gemini safety filters blocked the request or the response. */
export class BlockedResponseError extends Error {
  constructor(reason: string) {
    super(`blocked_${reason}`);
    this.name = 'BlockedResponseError';
  }
}
