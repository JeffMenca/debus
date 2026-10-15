// The mocked runs point the web server at a gateway that never answers (no local service uses this
// port), so a request a spec did not simulate fails on the network instead of reaching a real stack.
export const MOCKED_API_URL = 'http://localhost:4999';
