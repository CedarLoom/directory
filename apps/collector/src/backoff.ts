// GitHub's guidance: https://docs.github.com/en/rest/using-the-rest-api/best-practices-for-using-the-rest-api#handle-rate-limit-errors-appropriately

const serverErrorBaseMs = 1000;
const rateLimitBaseMs = 60_000;

function retryAfterMs(headers: Headers): number | undefined {
  const seconds = Number(headers.get('retry-after') ?? Number.NaN);
  return Number.isFinite(seconds) ? Math.max(0, seconds * 1000) : undefined;
}

function resetWaitMs(headers: Headers, now: number): number | undefined {
  if (headers.get('x-ratelimit-remaining') !== '0') return undefined;
  const resetSeconds = Number(headers.get('x-ratelimit-reset') ?? Number.NaN);
  return Number.isFinite(resetSeconds) ? Math.max(0, resetSeconds * 1000 - now) : undefined;
}

/**
 * Milliseconds to wait before retry number `attempt + 1` of a failed response, or undefined when retrying cannot help.
 * A 403 counts as a rate limit only with rate limit headers; without them it is a permission error.
 */
export function retryDelay(
  response: Pick<Response, 'status' | 'headers'>,
  attempt: number,
  now: number,
): number | undefined {
  const { status, headers } = response;
  if (status === 403 || status === 429) {
    const wait = retryAfterMs(headers) ?? resetWaitMs(headers, now);
    if (wait !== undefined) return wait;
    return status === 429 ? rateLimitBaseMs * 2 ** attempt : undefined;
  }
  // A 503 may say how long the server stays unavailable: https://www.rfc-editor.org/rfc/rfc9110#section-10.2.3
  return status >= 500 ? (retryAfterMs(headers) ?? serverErrorBaseMs * 2 ** attempt) : undefined;
}
