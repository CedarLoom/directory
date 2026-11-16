import { expect, it } from 'vitest';
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
