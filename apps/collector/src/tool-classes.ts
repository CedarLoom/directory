type ToolClass = 'read' | 'write' | 'bash' | 'web' | 'mcp' | 'agent' | 'other';

const order: readonly ToolClass[] = ['read', 'write', 'bash', 'web', 'mcp', 'agent', 'other'];

const classes: Readonly<Record<string, ToolClass>> = {
  Read: 'read',
  Grep: 'read',
  Glob: 'read',
  LS: 'read',
  NotebookRead: 'read',
  Write: 'write',
  Edit: 'write',
  MultiEdit: 'write',
  NotebookEdit: 'write',
  Bash: 'bash',
  WebFetch: 'web',
  WebSearch: 'web',
  Task: 'agent',
  Agent: 'agent',
};

// A tool name with an optional rule, such as `Bash(git diff:*)`; names are split on commas or spaces outside the rule.
const tool = /([A-Za-z_][\w-]*)(?:\([^)]*\))?/g;

/** The classes of the tools an `allowed-tools` or `tools` field names, in a fixed order. */
export function toolClasses(value: string | string[] | undefined): ToolClass[] {
  const text = Array.isArray(value) ? value.join(',') : (value ?? '');
  const found = new Set<ToolClass>();
  for (const [, name = ''] of text.matchAll(tool))
    found.add(name.startsWith('mcp__') ? 'mcp' : (classes[name] ?? 'other'));
  return order.filter((toolClass) => found.has(toolClass));
}
