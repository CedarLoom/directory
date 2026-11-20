import { afterEach, describe, expect, it, vi } from 'vitest';
import { createHttpClient, type HttpClientOptions, RequestCapError, RequestError } from './http-client.ts';

const request = { accept: 'text/plain', maxBytes: 100 };

/** A client over a fetch that answers with `responses` in turn and a clock whose sleeps end at once. */
function client(responses: Response[], options: Partial<HttpClientOptions> = {}) {
  const sent: string[] = [];
  const clock = { time: 0, now: () => clock.time, sleep: async (ms: number) => void (clock.time += ms) };
  const fetch = async (input: string | URL | Request) => {
    sent.push(new Request(input).url);
    const response = responses.shift();
    if (response === undefined) throw new Error('no response left');
    return response;
  };
  const http = createHttpClient({
    fetch,
    clock,
    headers: {},
    cap: 10,
    intervalMs: 0,
    maxRetries: 3,
    maxDelayMs: 60_000,
    log: () => undefined,
    ...options,
  });
  return { http, sent, clock };
}

it('refuses the request over the cap without sending it', async () => {
  const { http, sent } = client([new Response('a'), new Response('b'), new Response('c')], { cap: 2 });
  expect([await http.getText('https://a.test/1', request), await http.getText('https://a.test/2', request)]).toEqual([
    'a',
    'b',
  ]);
  await expect(http.getText('https://a.test/3', request)).rejects.toThrow(RequestCapError);
  expect({ sent, requests: http.requests }).toEqual({ sent: ['https://a.test/1', 'https://a.test/2'], requests: 2 });
});

it('counts retries against the cap', async () => {
  const { http, sent } = client([new Response(null, { status: 503 }), new Response(null, { status: 503 })], {
    cap: 2,
  });
  await expect(http.getText('https://a.test/1', request)).rejects.toThrow(RequestCapError);
  expect(sent).toEqual(['https://a.test/1', 'https://a.test/1']);
});

it('waits as retry-after asks and then returns the body', async () => {
  const { http, clock } = client([
    new Response(null, { status: 429, headers: { 'retry-after': '30' } }),
    new Response('catalog'),
  ]);
  expect(await http.getText('https://a.test/1', request)).toBe('catalog');
  expect(clock.now()).toBe(30_000);
});

it('stops instead of waiting longer than the longest wait', async () => {
  const { http, sent } = client([new Response(null, { status: 429, headers: { 'retry-after': '3600' } })]);
  await expect(http.getText('https://a.test/1', request)).rejects.toThrow(/answered 429/);
  expect(sent).toHaveLength(1);
});

it('stops after the last retry', async () => {
  const { http } = client([503, 503, 502, 500].map((status) => new Response(null, { status })));
  await expect(http.getText('https://a.test/1', request)).rejects.toThrow(/answered 500/);
});

it('refuses a body over the size cap', async () => {
  const { http } = client([new Response('x'.repeat(101))]);
  await expect(http.getText('https://a.test/1', request)).rejects.toThrow(RequestError);
});

/** A body of 64-byte chunks, pulled only when read, that fails once read past `chunks` chunks. */
function chunkedBody(chunks: number): ReadableStream<Uint8Array> {
  let pulled = 0;
  return new ReadableStream(
    {
      pull(controller) {
        pulled += 1;
        if (pulled > chunks) controller.error(new Error('read past the cap'));
        else controller.enqueue(new Uint8Array(64));
      },
    },
    { highWaterMark: 0 },
  );
}

it('stops reading a body once it passes the size cap', async () => {
  const { http } = client([new Response(chunkedBody(3))]);
  await expect(http.getText('https://a.test/1', request)).rejects.toThrow(/more than the cap/);
});

it('refuses a body whose declared length passes the size cap without reading it', async () => {
  const { http } = client([new Response(chunkedBody(0), { headers: { 'content-length': '1000' } })]);
  await expect(http.getText('https://a.test/1', request)).rejects.toThrow(/more than the cap/);
});

it('sends the next request after a body over the size cap only for a caller that handles it', async () => {
  const handled = client([new Response('x'.repeat(101)), new Response('b')]).http;
  await expect(handled.getText('https://a.test/1', { ...request, oversizeStops: false })).rejects.toThrow(/the cap/);
  const stopping = client([new Response('x'.repeat(101)), new Response('b')]).http;
  await expect(stopping.getText('https://a.test/1', request)).rejects.toThrow(/the cap/);
  expect({
    handled: await handled.getText('https://a.test/2', request),
    stopping: await stopping.getText('https://a.test/2', request).catch((error: Error) => error.message),
  }).toEqual({ handled: 'b', stopping: 'https://a.test/1: the body has more than the cap of 100 bytes' });
});

it('stops at a redirect instead of following it past the cap', async () => {
  const sent: string[] = [];
  // Follows a redirect as the platform's fetch does unless the request asks for `manual`.
  const fetch = async (input: string | URL | Request, init?: RequestInit) => {
    sent.push(new Request(input).url);
    if (init?.redirect === 'manual')
      return new Response(null, { status: 301, headers: { location: 'https://b.test/' } });
    sent.push('https://b.test/');
    return new Response('moved');
  };
  const { http } = client([], { fetch });
  await expect(http.getText('https://a.test/1', request)).rejects.toThrow(/answered 301/);
  expect({ sent, requests: http.requests }).toEqual({ sent: ['https://a.test/1'], requests: 1 });
});

describe('with a queue of requests one second apart', () => {
  // Sleeps on the faked timers, so concurrent requests wake in the order they are due.
  const timers = {
    now: () => Date.now(),
    sleep: (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)),
  };
  const urls = ['a', 'b', 'c', 'd'].map((name) => `https://a.test/${name}`);
  afterEach(() => vi.useRealTimers());

  it('holds every queued request while a rate limit lasts', async () => {
    vi.useFakeTimers({ now: 0 });
    const lines: string[] = [];
    const answers = [new Response(null, { status: 429, headers: { 'retry-after': '60' } })];
    const { http } = client([...answers, ...['b', 'c', 'd', 'a'].map((body) => new Response(body))], {
      clock: timers,
      intervalMs: 1000,
      log: (line) => lines.push(`${Date.now()} ${line}`),
    });
    const bodies = Promise.all(urls.map((url) => http.getText(url, request)));
    await vi.runAllTimersAsync();
    expect(await bodies).toEqual(['a', 'b', 'c', 'd']);
    expect(lines).toEqual([
      '0 GET https://a.test/a 429',
      '60000 GET https://a.test/b 200',
      '61000 GET https://a.test/c 200',
      '62000 GET https://a.test/d 200',
      '63000 GET https://a.test/a 200',
    ]);
  });

  it('sends no queued request after a request failed', async () => {
    vi.useFakeTimers({ now: 0 });
    const answers = [new Response(null, { status: 404 }), ...['b', 'c', 'd'].map((body) => new Response(body))];
    const { http, sent } = client(answers, { clock: timers, intervalMs: 1000 });
    const results = Promise.allSettled(urls.map((url) => http.getText(url, request)));
    await vi.runAllTimersAsync();
    expect((await results).map(({ status }) => status)).toEqual(['rejected', 'rejected', 'rejected', 'rejected']);
    expect(sent).toEqual(['https://a.test/a']);
  });
});
