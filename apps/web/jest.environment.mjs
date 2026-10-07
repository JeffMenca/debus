// jsdom lacks the Fetch API; expose Node's implementation so components can call the gateway in tests.
import { TestEnvironment } from 'jest-environment-jsdom';

export default class JsdomWithFetch extends TestEnvironment {
  constructor(...args) {
    super(...args);
    Object.assign(this.global, { fetch, Request, Response, Headers, AbortSignal });
  }
}
