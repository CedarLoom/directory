import { itemName } from '@directory/contracts';
import { bodyLines, readFrontmatter, textField, tokenEstimate } from './frontmatter.ts';
import { toolClasses, unrestrictedBash } from './tool-classes.ts';

/** The facts of an agent file; its name is read, its description and prompt are only counted. */
export function analyzeAgent(text: string) {
  const frontmatter = readFrontmatter(text);
  const declaredName = textField(frontmatter, 'name');
  const name = itemName.safeParse(declaredName);
  const tools = frontmatter.fields.get('tools');
  return {
    ...(name.success ? { name: name.data } : {}),
    declaredName,
    descriptionLength: textField(frontmatter, 'description')?.length ?? 0,
    bodyLines: bodyLines(frontmatter),
    // Without a `tools` value the agent inherits every tool of the session.
    toolsDeclared: tools !== undefined && tools !== '',
    toolClasses: toolClasses(tools),
    unrestrictedBash: unrestrictedBash(tools),
    // `inherit` is the same as no model.
    modelSet: !['inherit', undefined].includes(textField(frontmatter, 'model')),
    tokens: tokenEstimate(frontmatter),
  };
}

export type AgentAnalysis = ReturnType<typeof analyzeAgent>;
