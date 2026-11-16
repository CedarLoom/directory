type ToolClass = 'read' | 'write' | 'bash' | 'web' | 'mcp' | 'agent' | 'other';

const order: readonly ToolClass[] = ['read', 'write', 'bash', 'web', 'mcp', 'agent', 'other'];

// A Map, so a name such as `constructor` reads no inherited property.
const classes: ReadonlyMap<string, ToolClass> = new Map([
  ['Read', 'read'],
  ['Grep', 'read'],
  ['Glob', 'read'],
  ['LS', 'read'],
  ['NotebookRead', 'read'],
  ['Write', 'write'],
  ['Edit', 'write'],
  ['MultiEdit', 'write'],
  ['NotebookEdit', 'write'],
  ['Bash', 'bash'],
  ['WebFetch', 'web'],
  ['WebSearch', 'web'],
  ['Task', 'agent'],
  ['Agent', 'agent'],
]);

// A tool name with an optional rule, such as `Bash(git diff:*)`; names are split on commas or spaces outside the rule.
const tool = /([A-Za-z_][\w-]*)(?:\([^)]*\))?/g;
const toolName = /([A-Za-z_][\w-]*)/g;

/** The classes of the tools an `allowed-tools` or `tools` field names, in a fixed order. */
export function toolClasses(value: string | string[] | undefined): ToolClass[] {
  const text = Array.isArray(value) ? value.join(',') : (value ?? '');
  // No rule closes after the last `)`, so names there are read without one: `\([^)]*\)` would scan to the end at each `(`.
  const end = text.lastIndexOf(')') + 1;
  const found = new Set<ToolClass>();
  for (const [, name = ''] of [...text.slice(0, end).matchAll(tool), ...text.slice(end).matchAll(toolName)])
    found.add(name.startsWith('mcp__') ? 'mcp' : (classes.get(name) ?? 'other'));
  return order.filter((toolClass) => found.has(toolClass));
}
