import { gitSha, versionLabel } from '@directory/contracts';
import { z } from 'zod';
import type { Repository } from './github-contents.ts';
import { queryEach } from './github-graphql.ts';
import { repositoryId } from './github-location.ts';
import type { HttpClient } from './http-client.ts';

const factsAnswer = z
  .object({
    stargazerCount: z.int().nonnegative(),
    pushedAt: z.iso.datetime().nullable(),
    isArchived: z.boolean(),
    licenseInfo: z.object({ spdxId: z.string().nullable() }).nullable(),
    owner: z.object({ kind: z.enum(['User', 'Organization']) }),
    defaultBranchRef: z
      .object({ target: z.object({ oid: gitSha, history: z.object({ totalCount: z.int() }) }) })
      .nullable(),
    latestRelease: z.object({ tagName: z.string(), publishedAt: z.iso.datetime().nullable() }).nullable(),
  })
  .nullable();
type FactsAnswer = NonNullable<z.infer<typeof factsAnswer>>;

interface Maintenance {
  pushedAt: string;
  recentCommits: 'none' | '1-4' | '5+';
  latestRelease?: { tag: string; date: string };
  archived: boolean;
  headSha: string;
}

export interface RepositoryFacts {
  stars: number;
  ownerType: 'user' | 'organization';
  /** GitHub's detected SPDX id; `NOASSERTION` when it found a license it could not name. */
  license?: string;
  /** Absent for an empty repository. */
  maintenance?: Maintenance;
}

// Commits in the 90 days before the run date.
const recentDays = 90;

function recentCommits(count: number): Maintenance['recentCommits'] {
  if (count === 0) return 'none';
  return count < 5 ? '1-4' : '5+';
}

function latestRelease(release: FactsAnswer['latestRelease']): Pick<Maintenance, 'latestRelease'> {
  const tag = versionLabel.safeParse(release?.tagName);
  // A tag that is no version label, such as one with spaces, is left out rather than stored.
  if (!tag.success || release?.publishedAt == null) return {};
  return { latestRelease: { tag: tag.data, date: release.publishedAt.slice(0, 10) } };
}

function maintenance({ pushedAt, defaultBranchRef, ...answer }: FactsAnswer): Pick<RepositoryFacts, 'maintenance'> {
  if (pushedAt === null || defaultBranchRef === null) return {};
  return {
    maintenance: {
      pushedAt,
      recentCommits: recentCommits(defaultBranchRef.target.history.totalCount),
      ...latestRelease(answer.latestRelease),
      archived: answer.isArchived,
      headSha: defaultBranchRef.target.oid,
    },
  };
}

function toFacts(answer: FactsAnswer): RepositoryFacts {
  const license = answer.licenseInfo?.spdxId;
  return {
    stars: answer.stargazerCount,
    ownerType: answer.owner.kind === 'User' ? 'user' : 'organization',
    ...(license == null ? {} : { license }),
    ...maintenance(answer),
  };
}

const fragments = `fragment Facts on Repository { stargazerCount pushedAt isArchived licenseInfo { spdxId } owner { kind: __typename } defaultBranchRef { target { ... on Commit { oid history(since: $since) { totalCount } } } } latestRelease { tagName publishedAt } }`;

/** Reads the facts of each repository, keyed by repository id; a repository GitHub does not find has none. */
export async function readFacts(
  client: HttpClient,
  repositories: readonly Repository[],
  runDate: string,
): Promise<Map<string, RepositoryFacts>> {
  const since = new Date(Date.parse(runDate) - recentDays * 86_400_000).toISOString();
  const answers = await queryEach(client, repositories, {
    name: 'Facts',
    variables: { owner: 'String!', name: 'String!' },
    field: (variable) => `repository(owner: ${variable('owner')}, name: ${variable('name')}) { ...Facts }`,
    values: ({ owner, repo }) => ({ owner, name: repo }),
    fragments,
    shared: { types: { since: 'GitTimestamp!' }, values: { since } },
    batchSize: 50,
  });
  const facts = new Map<string, RepositoryFacts>();
  for (const [index, repository] of repositories.entries()) {
    const answer = factsAnswer.parse(answers[index]);
    if (answer !== null) facts.set(repositoryId(repository), toFacts(answer));
  }
  return facts;
}
