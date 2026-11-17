import type { Meta, StoryObj } from '@storybook/react-vite';
import { type Item, loadItem } from '../item-data.ts';
import { runMeta } from '../meta-data.ts';
import type { Kind } from '../data-types.ts';
import { ItemPage } from './ItemPage.tsx';

async function fixtureItem(kind: Kind, id: string): Promise<Item> {
  const item = await loadItem(kind, id);
  if (item === undefined) throw new Error(`No fixture ${kind}/${id}`);
  return item;
}

// A plugin with two flags and a rubric change in its score history.
const plugin = await fixtureItem('plugin', 'gh.example-org.plugins.code-review');
// An MCP server: a registry link and no stars.
const mcpServer = await fixtureItem('mcp-server', 'io.github.example-org.weather');

const meta = {
  component: ItemPage,
  args: { item: plugin, runAt: runMeta.runAt },
} satisfies Meta<typeof ItemPage>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Plugin: Story = {};

export const McpServer: Story = { args: { item: mcpServer } };
