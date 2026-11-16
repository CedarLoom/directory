import { retryDelay } from './backoff.ts';
import type { Clock } from './clock.ts';
import { createRateLimiter } from './rate-limiter.ts';

/** A request the client did not complete; the run stops and the previously published data stays. */
export class RequestError extends Error {
  override name = 'RequestError';
}

/** The request over the cap, refused before it is sent. */
export class RequestCapError extends RequestError {
  override name = 'RequestCapError';
}

export interface HttpClientOptions {
  fetch: typeof fetch;
  clock: Clock;
  /** Sent with every request, such as the user agent and the authorization. */
  headers: Readonly<Record<string, string>>;
  /** Most requests sent in one run, retries included. */
  cap: number;
  /** Least time between the starts of two requests. */
  intervalMs: number;
  maxRetries: number;
  /** A longer wait, such as a rate limit reset an hour away, stops the run instead of holding it. */
  maxDelayMs: number;
  log: (line: string) => void;
}

export interface HttpClient {
  /** GETs `url` and returns the body as UTF-8 text; a body over `maxBytes` is refused. */
  getText(url: string, request: { accept: string; maxBytes: number }): Promise<string>;
  /** Requests sent so far, retries included. */
  readonly requests: number;
}

async function readText(response: Response, url: string, maxBytes: number): Promise<string> {
  const body = await response.arrayBuffer();
  if (body.byteLength > maxBytes)
    throw new RequestError(`${url}: the body has ${body.byteLength} bytes, more than the cap of ${maxBytes}`);
  return new TextDecoder('utf-8', { fatal: true }).decode(body);
}

export function createHttpClient(options: HttpClientOptions): HttpClient {
  const { clock, cap, log } = options;
  const waitTurn = createRateLimiter(clock, options.intervalMs);
  let requests = 0;

  async function send(url: string, headers: Record<string, string>): Promise<Response> {
    if (requests >= cap) throw new RequestCapError(`request cap of ${cap} reached; refused GET ${url}`);
    requests += 1;
    await waitTurn();
    const response = await options.fetch(url, { headers }).catch((cause: unknown) => {
      throw new RequestError(`GET ${url} failed`, { cause });
    });
    log(`GET ${url} ${response.status}`);
    return response;
  }

  async function getText(url: string, request: { accept: string; maxBytes: number }, attempt = 0): Promise<string> {
    const response = await send(url, { ...options.headers, accept: request.accept });
    if (response.ok) return readText(response, url, request.maxBytes);
    await response.body?.cancel();
    const delay = attempt < options.maxRetries ? retryDelay(response, attempt, clock.now()) : undefined;
    if (delay === undefined || delay > options.maxDelayMs)
      throw new RequestError(`GET ${url} answered ${response.status}`);
    await clock.sleep(delay);
    return getText(url, request, attempt + 1);
  }

  return {
    getText,
    get requests() {
      return requests;
    },
  };
}
