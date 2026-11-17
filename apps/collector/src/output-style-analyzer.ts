import { keyword } from '@directory/contracts';
import { readFrontmatter } from './frontmatter.ts';

/** The facts of an output style file; the whole text joins the system prompt, so its token estimate covers all of it. */
export function analyzeOutputStyle(text: string) {
  return {
    // Token figures are estimates: characters divided by 4.
    tokens: Math.ceil(text.length / 4),
    frontmatterFields: [...readFrontmatter(text).fields.keys()].filter((key) => keyword.safeParse(key).success),
  };
}
