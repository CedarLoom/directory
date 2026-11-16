import { itemName, keyword } from '@directory/contracts';
import { bodyLines, readFrontmatter, textField, tokenEstimate } from './frontmatter.ts';
import { toolClasses } from './tool-classes.ts';

/** The facts of a SKILL.md; its name and license are read, its description and body are only counted. */
export function analyzeSkill(text: string) {
  const frontmatter = readFrontmatter(text);
  const name = itemName.safeParse(textField(frontmatter, 'name'));
  return {
    ...(name.success ? { name: name.data } : {}),
    declaredLicense: textField(frontmatter, 'license'),
    frontmatterFields: [...frontmatter.fields.keys()].filter((key) => keyword.safeParse(key).success),
    bodyLines: bodyLines(frontmatter),
    tokens: tokenEstimate(frontmatter),
    allowedTools: toolClasses(frontmatter.fields.get('allowed-tools')),
  };
}
