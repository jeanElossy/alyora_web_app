export {
  errorDetailsSchema,
  errorIssueSchema,
  errorResponseSchema,
} from './error-response.schema.js';
export { pingResponseSchema } from './ping.schema.js';

// Types réexportés (un typedef JSDoc n'est pas transmis par `export ... from`).
/** @typedef {import('./error-response.schema.js').ErrorIssue} ErrorIssue */
/** @typedef {import('./error-response.schema.js').ErrorDetails} ErrorDetails */
/** @typedef {import('./error-response.schema.js').ErrorResponse} ErrorResponse */
/** @typedef {import('./ping.schema.js').PingResponse} PingResponse */
