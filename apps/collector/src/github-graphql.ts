import { z } from 'zod';
import { BodyCapError, type HttpClient, RequestError } from './http-client.ts';

/** An answer whose errors refuse the query; the request itself went through. */
class AnswerError extends RequestError {
  override name = 'AnswerError';
}

const endpoint = 'https://api.github.com/graphql';
// A batch of marketplace files can pass a few MB; the cap only stops a runaway answer.
const maxBytes = 32 * 1024 * 1024;

const answer = z.object({
  data: z.record(z.string(), z.unknown()).nullable().optional(),
  errors: z
    .array(z.object({ type: z.string().optional(), path: z.array(z.union([z.string(), z.int()])).optional() }))
    .optional(),
});

/**
 * Sends one query; a missing or blocked repository reads as null, any other error stops the run unless `apart` and the
 * caller handles an error answer or a body over the cap.
 */
async function query(client: HttpClient, text: string, variables: Record<string, unknown>, apart: boolean) {
  const body = await client.postText(endpoint, JSON.stringify({ query: text, variables }), {
    accept: 'application/json',
    maxBytes,
    oversizeStops: !apart,
  });
  const { data, errors = [] } = answer.parse(JSON.parse(body));
  const fatal = errors.filter(({ type }) => type !== 'NOT_FOUND' && type !== 'FORBIDDEN');
  // A rate limit holds for the token, not for one item, so no item read alone would pass it.
  const Failure = fatal.some(({ type }) => type === 'RATE_LIMITED') ? RequestError : AnswerError;
  // Types and paths only: an error message can quote third-party text.
  if (fatal.length > 0 || data == null)
    throw new Failure(
      `GraphQL answered ${fatal.map(({ type, path = [] }) => `${type ?? 'error'} at ${path.join('.') || 'the query'}`).join(', ') || 'no data'}`,
    );
  return data;
}

/** One aliased field per item; every third-party value travels as a variable, never in the query text. */
export interface AliasedQuery<T> {
  name: string;
  /** Variable names and GraphQL types each item binds, such as `{ owner: 'String!' }`. */
  variables: Readonly<Record<string, string>>;
  /** The field of one item; `variable(name)` gives the item's own variable. */
  field(variable: (name: string) => string): string;
  values(item: T): Readonly<Record<string, string>>;
  fragments: string;
  /** Variables all items share, declared and bound once. */
  shared?: { types: Readonly<Record<string, string>>; values: Readonly<Record<string, unknown>> };
  batchSize: number;
}

/** The variable `name` of the item at `index`. */
const own = (index: number) => (name: string) => `$${name}${index}`;

async function queryBatch<T>(
  client: HttpClient,
  batch: readonly T[],
  spec: AliasedQuery<T>,
  apart: boolean,
): Promise<unknown[]> {
  const declarations = [
    ...Object.entries(spec.shared?.types ?? {}).map(([name, type]) => `$${name}: ${type}`),
    ...batch.flatMap((_, index) =>
      Object.entries(spec.variables).map(([name, type]) => `${own(index)(name)}: ${type}`),
    ),
  ];
  const fields = batch.map((_, index) => `a${index}: ${spec.field(own(index))}`);
  const variables = {
    ...spec.shared?.values,
    ...Object.fromEntries(
      batch.flatMap((item, index) =>
        Object.entries(spec.values(item)).map(([name, value]) => [`${name}${index}`, value]),
      ),
    ),
  };
  const data = await query(
    client,
    `query ${spec.name}(${declarations.join(', ')}) { ${fields.join(' ')} } ${spec.fragments}`,
    variables,
    apart,
  );
  return batch.map((_, index) => data[`a${index}`] ?? null);
}

const batchesOf = <T>(items: readonly T[], size: number): T[][] =>
  Array.from({ length: Math.ceil(items.length / size) }, (_, index) => items.slice(index * size, (index + 1) * size));

/** Runs the query over `items` in batches and returns each item's field, null for a missing or blocked repository. */
export async function queryEach<T>(client: HttpClient, items: readonly T[], spec: AliasedQuery<T>): Promise<unknown[]> {
  const results = await Promise.all(
    batchesOf(items, spec.batchSize).map((batch) => queryBatch(client, batch, spec, false)),
  );
  return results.flat();
}

/** An item's field, or the error of the answer to the item read alone. */
export type ItemAnswer = { field: unknown } | { error: RequestError };

/**
 * Runs the query as queryEach does, but reads a batch that GraphQL refuses or that answers over the cap again one item
 * at a time, so one item's answer cannot fail the others; an item that fails alone gives its error.
 */
export async function queryEachApart<T>(
  client: HttpClient,
  items: readonly T[],
  spec: AliasedQuery<T>,
): Promise<ItemAnswer[]> {
  const read = async (batch: readonly T[]): Promise<ItemAnswer[]> => {
    try {
      return (await queryBatch(client, batch, spec, true)).map((field) => ({ field }));
    } catch (error) {
      if (!(error instanceof AnswerError || error instanceof BodyCapError)) throw error;
      if (batch.length === 1) return [{ error }];
      return (await Promise.all(batch.map((item) => read([item])))).flat();
    }
  };
  return (await Promise.all(batchesOf(items, spec.batchSize).map(read))).flat();
}
