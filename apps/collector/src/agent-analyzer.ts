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
    // Without a `tools` field the agent inherits every tool of the session.
    toolsDeclared: tools !== undefined,
    toolClasses: toolClasses(tools),
    modelSet: textField(frontmatter, 'model') !== undefined,
    tokens: tokenEstimate(frontmatter),
  };
}
