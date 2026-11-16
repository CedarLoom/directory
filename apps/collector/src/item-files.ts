import { z } from 'zod';
import { queryEach } from './github-graphql.ts';
import type { GitHubLocation } from './github-location.ts';
import type { HttpClient } from './http-client.ts';
import { blob, expression } from './repository-tree.ts';
const subdirectory = z.object({
  entries: z
    .array(
      z.object({
        name: z.string(),
        type: z.string(),
        object: z.object({ entries: z.array(z.object({ type: z.string() })).optional() }).nullable(),
      }),
    )
    .optional(),
});
const answer = z.object({ file: blob, directory: subdirectory.nullable().optional() }).nullable();

/** Files a skill bundles beside SKILL.md, by folder. */
export interface SkillFolders {
  scripts: number;
  references: number;
  assets: number;
}

export interface ItemFile {
  /** Absent for a missing, binary or cut file. */
  text?: string;
  folders: SkillFolders;
}

function folders(directory: z.infer<typeof subdirectory> | null | undefined): SkillFolders {
  const count = (name: string) =>
    directory?.entries
      ?.find((entry) => entry.name === name && entry.type === 'tree')
      ?.object?.entries?.filter((entry) => entry.type === 'blob').length ?? 0;
  return { scripts: count('scripts'), references: count('references'), assets: count('assets') };
}

/**
 * Reads one file of each location, such as a skill's SKILL.md or an agent's own file, 25 to a query.
 * With `folders` it also counts the files in the location's scripts, references and assets folders.
 */
export async function readItemFiles(
  client: HttpClient,
  targets: readonly { location: GitHubLocation; file: string }[],
  withFolders: boolean,
): Promise<ItemFile[]> {
  const folderField = (variable: (name: string) => string) =>
    withFolders
      ? `directory: object(expression: ${variable('directory')}) { ... on Tree { entries { name type object { ... on Tree { entries { type } } } } } }`
      : '';
  const answers = await queryEach(client, targets, {
    name: withFolders ? 'SkillFiles' : 'ItemFiles',
    variables: { owner: 'String!', name: 'String!', file: 'String!', ...(withFolders ? { directory: 'String!' } : {}) },
    field: (variable) =>
      `repository(owner: ${variable('owner')}, name: ${variable('name')}) { file: object(expression: ${variable('file')}) { ... on Blob { text isTruncated } } ${folderField(variable)} }`,
    values: ({ location, file }) => ({
      owner: location.owner,
      name: location.repo,
      file: expression(location, file),
      ...(withFolders ? { directory: expression(location, '') } : {}),
    }),
    fragments: '',
    batchSize: 25,
  });
  return answers.map((raw) => {
    const read = answer.parse(raw);
    const text = read?.file?.isTruncated === true ? undefined : read?.file?.text;
    const found = folders(read?.directory);
    return text == null ? { folders: found } : { text, folders: found };
  });
}
