import { bodyLines, frontmatterFields, readFrontmatter, textField } from './frontmatter.ts';

/**
 * The facts of an output style file; the whole text joins the system prompt, so its token estimate covers all of it.
 * More frontmatter fields than the record holds throw a ZodError.
 */
export function analyzeOutputStyle(text: string) {
  const frontmatter = readFrontmatter(text);
  return {
    // Token figures are estimates: characters divided by 4.
    tokens: Math.ceil(text.length / 4),
    frontmatterFields: frontmatterFields(frontmatter),
    named: textField(frontmatter, 'name') !== undefined,
    described: textField(frontmatter, 'description') !== undefined,
    bodyLines: bodyLines(frontmatter),
  };
}

export type OutputStyleAnalysis = ReturnType<typeof analyzeOutputStyle>;
