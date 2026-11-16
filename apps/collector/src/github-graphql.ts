import { z } from 'zod';
import { type HttpClient, RequestError } from './http-client.ts';

const endpoint = 'https://api.github.com/graphql';
// A batch of marketplace files can pass a few MB; the cap only stops a runaway answer.
const maxBytes = 32 * 1024 * 1024;

const answer = z.object({
  data: z.record(z.string(), z.unknown()).nullable().optional(),
  errors: z
    .array(z.object({ type: z.string().optional(), path: z.array(z.union([z.string(), z.int()])).optional() }))
    .optional(),
});

/** Sends one query; a missing repository reads as null, any other error stops the run. */
async function query(client: HttpClient, text: string, variables: Record<string, unknown>) {
  const body = await client.postText(endpoint, JSON.stringify({ query: text, variables }), {
    accept: 'application/json',
    maxBytes,
  });
  const { data, errors = [] } = answer.parse(JSON.parse(body));
  const fatal = errors.filter(({ type }) => type !== 'NOT_FOUND');
  // Types and paths only: an error message can quote third-party text.
  if (fatal.length > 0 || data == null)
    throw new RequestError(
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

async function queryBatch<T>(client: HttpClient, batch: readonly T[], spec: AliasedQuery<T>): Promise<unknown[]> {
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
  );
  return batch.map((_, index) => data[`a${index}`] ?? null);
}

/** Runs the query over `items` in batches and returns each item's field, null for a missing repository. */
export async function queryEach<T>(client: HttpClient, items: readonly T[], spec: AliasedQuery<T>): Promise<unknown[]> {
  const batches = Array.from({ length: Math.ceil(items.length / spec.batchSize) }, (_, index) =>
    items.slice(index * spec.batchSize, (index + 1) * spec.batchSize),
  );
  const results = await Promise.all(batches.map((batch) => queryBatch(client, batch, spec)));
  return results.flat();
}
