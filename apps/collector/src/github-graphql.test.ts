import { expect, it } from 'vitest';
import { queryEachApart } from './github-graphql.ts';
import type { HttpClient } from './http-client.ts';

/** A client whose every GraphQL answer holds one error of `type` and no data. */
function answering(type: string): HttpClient {
  return {
    getText: () => Promise.reject(new Error('not used')),
    postText: async () => JSON.stringify({ data: null, errors: [{ type }] }),
    requests: 0,
  };
}

const spec = {
  name: 'Folders',
  variables: { path: 'String!' },
  field: (variable: (name: string) => string) => `object(expression: ${variable('path')}) { id }`,
  values: (path: string) => ({ path }),
  fragments: '',
  batchSize: 2,
};

it('stops at a rate limit instead of reading each item alone', async () => {
  const [limited, refused] = await Promise.allSettled([
    queryEachApart(answering('RATE_LIMITED'), ['a', 'b'], spec),
    queryEachApart(answering('RESOURCE_LIMITS_EXCEEDED'), ['a', 'b'], spec),
  ]);
  expect({
    limited: limited.status === 'rejected' ? String(limited.reason) : 'read',
    refused:
      refused.status === 'fulfilled' ? refused.value.map((answer) => String(Object.values(answer)[0])) : 'stopped',
  }).toEqual({
    limited: 'RequestError: GraphQL answered RATE_LIMITED at the query',
    refused: [
      'AnswerError: GraphQL answered RESOURCE_LIMITS_EXCEEDED at the query',
      'AnswerError: GraphQL answered RESOURCE_LIMITS_EXCEEDED at the query',
    ],
  });
});
