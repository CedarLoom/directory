import { itemName, keyword } from '@directory/contracts';
import { bodyLines, readFrontmatter, textField, tokenEstimate } from './frontmatter.ts';
import { toolClasses, unrestrictedBash } from './tool-classes.ts';

/** The facts of a SKILL.md; its name and license are read, its description and body are only counted. */
export function analyzeSkill(text: string) {
  const frontmatter = readFrontmatter(text);
  const declaredName = textField(frontmatter, 'name');
  const name = itemName.safeParse(declaredName);
  return {
    ...(name.success ? { name: name.data } : {}),
    declaredName,
    declaredLicense: textField(frontmatter, 'license'),
    descriptionLength: textField(frontmatter, 'description')?.length ?? 0,
    frontmatterFields: [...frontmatter.fields.keys()].filter((key) => keyword.safeParse(key).success),
    bodyLines: bodyLines(frontmatter),
    tokens: tokenEstimate(frontmatter),
    allowedTools: toolClasses(frontmatter.fields.get('allowed-tools')),
    unrestrictedBash: unrestrictedBash(frontmatter.fields.get('allowed-tools')),
  };
}
