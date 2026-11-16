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

/** Reads the body as strict UTF-8 and stops reading once it passes `maxBytes`. */
async function readText(response: Response, url: string, maxBytes: number): Promise<string> {
  const declared = Number(response.headers.get('content-length') ?? 0);
  if (declared > maxBytes) {
    await response.body?.cancel();
    throw new RequestError(`${url}: the body has ${declared} bytes, more than the cap of ${maxBytes}`);
  }
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let size = 0;
  let text = '';
  // Leaving the loop by a throw cancels the stream.
  for await (const chunk of response.body ?? []) {
    size += chunk.byteLength;
    if (size > maxBytes) throw new RequestError(`${url}: the body has more than the cap of ${maxBytes} bytes`);
    text += decoder.decode(chunk, { stream: true });
  }
  return text + decoder.decode();
}

export function createHttpClient(options: HttpClientOptions): HttpClient {
  const { clock, cap, log } = options;
  const limiter = createRateLimiter(clock, options.intervalMs);
  let requests = 0;
  // The first failure stops the run, so requests still queued are not sent.
  let stopped: RequestError | undefined;

  async function send(url: string, headers: Record<string, string>): Promise<Response> {
    if (stopped !== undefined) throw stopped;
    await limiter.waitTurn();
    if (stopped !== undefined) throw stopped;
    if (requests >= cap) throw new RequestCapError(`request cap of ${cap} reached; refused GET ${url}`);
    requests += 1;
    // A redirect is answered, not followed, so every request sent passes the cap and the limiter.
    const response = await options.fetch(url, { headers, redirect: 'manual' });
    log(`GET ${url} ${response.status}`);
    return response;
  }

  async function attempt(url: string, request: { accept: string; maxBytes: number }, retry: number): Promise<string> {
    const response = await send(url, { ...options.headers, accept: request.accept });
    if (response.ok) return readText(response, url, request.maxBytes);
    await response.body?.cancel();
    const delay = retry < options.maxRetries ? retryDelay(response, retry, clock.now()) : undefined;
    if (delay === undefined || delay > options.maxDelayMs)
      throw new RequestError(`GET ${url} answered ${response.status}`);
    limiter.hold(delay);
    await clock.sleep(delay);
    return attempt(url, request, retry + 1);
  }

  async function getText(url: string, request: { accept: string; maxBytes: number }): Promise<string> {
    try {
      return await attempt(url, request, 0);
    } catch (error) {
      // A network error, a cut connection or invalid UTF-8 also stops the run as a failed request.
      const failure = error instanceof RequestError ? error : new RequestError(`GET ${url} failed`, { cause: error });
      stopped ??= failure;
      throw failure;
    }
  }

  return {
    getText,
    get requests() {
      return requests;
    },
  };
}
