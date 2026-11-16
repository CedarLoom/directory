import { itemName } from '@directory/contracts';
import { readFrontmatter, textField, tokenEstimate } from './frontmatter.ts';
import { toolClasses } from './tool-classes.ts';

/** The facts of an agent file; its name is read, its description and prompt are only counted. */
export function analyzeAgent(text: string) {
  const frontmatter = readFrontmatter(text);
  const name = itemName.safeParse(textField(frontmatter, 'name'));
  const tools = frontmatter.fields.get('tools');
  return {
    ...(name.success ? { name: name.data } : {}),
    // Without a `tools` value the agent inherits every tool of the session.
    toolsDeclared: tools !== undefined && tools !== '',
    toolClasses: toolClasses(tools),
    // `inherit` is the same as no model.
    modelSet: !['inherit', undefined].includes(textField(frontmatter, 'model')),
    tokens: tokenEstimate(frontmatter),
  };
}
