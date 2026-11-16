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

interface TextRequest {
  accept: string;
  maxBytes: number;
}

export interface HttpClient {
  /** GETs `url` and returns the body as UTF-8 text; a body over `maxBytes` is refused. */
  getText(url: string, request: TextRequest): Promise<string>;
  /** POSTs a JSON `body` to `url` and returns the answer as getText does. */
  postText(url: string, body: string, request: TextRequest): Promise<string>;
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

interface Call {
  method: 'GET' | 'POST';
  url: string;
  body?: string;
}

export function createHttpClient(options: HttpClientOptions): HttpClient {
  const { clock, cap, log } = options;
  const limiter = createRateLimiter(clock, options.intervalMs);
  let requests = 0;
  // The first failure stops the run, so requests still queued are not sent.
  let stopped: RequestError | undefined;

  async function send(call: Call, accept: string): Promise<Response> {
    if (stopped !== undefined) throw stopped;
    await limiter.waitTurn();
    if (stopped !== undefined) throw stopped;
    if (requests >= cap) throw new RequestCapError(`request cap of ${cap} reached; refused ${call.method} ${call.url}`);
    requests += 1;
    const headers = {
      ...options.headers,
      accept,
      ...(call.body === undefined ? {} : { 'content-type': 'application/json' }),
    };
    // A redirect is answered, not followed, so every request sent passes the cap and the limiter.
    const body = call.body === undefined ? {} : { body: call.body };
    const response = await options.fetch(call.url, { method: call.method, headers, ...body, redirect: 'manual' });
    log(`${call.method} ${call.url} ${response.status}`);
    return response;
  }

  async function attempt(call: Call, textRequest: TextRequest, retry: number): Promise<string> {
    const response = await send(call, textRequest.accept);
    if (response.ok) return readText(response, call.url, textRequest.maxBytes);
    await response.body?.cancel();
    const delay = retry < options.maxRetries ? retryDelay(response, retry, clock.now()) : undefined;
    if (delay === undefined || delay > options.maxDelayMs)
      throw new RequestError(`${call.method} ${call.url} answered ${response.status}`);
    limiter.hold(delay);
    await clock.sleep(delay);
    return attempt(call, textRequest, retry + 1);
  }

  async function request(call: Call, textRequest: TextRequest): Promise<string> {
    try {
      return await attempt(call, textRequest, 0);
    } catch (error) {
      // A network error, a cut connection or invalid UTF-8 also stops the run as a failed request.
      const failure =
        error instanceof RequestError ? error : new RequestError(`${call.method} ${call.url} failed`, { cause: error });
      stopped ??= failure;
      throw failure;
    }
  }

  return {
    getText: (url, textRequest) => request({ method: 'GET', url }, textRequest),
    postText: (url, body, textRequest) => request({ method: 'POST', url, body }, textRequest),
    get requests() {
      return requests;
    },
  };
}
