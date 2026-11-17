import {
  agentRecord,
  hookRecord,
  marketplaceRecord,
  mcpServerRecord,
  outputStyleRecord,
  pluginRecord,
  skillRecord,
} from '@directory/contracts';
import { describe, expect, it } from 'vitest';
import agentFixture from '../../contracts/fixtures/records/agent.json' with { type: 'json' };
import hookFixture from '../../contracts/fixtures/records/hook.json' with { type: 'json' };
import marketplaceFixture from '../../contracts/fixtures/records/marketplace.json' with { type: 'json' };
import mcpServerFixture from '../../contracts/fixtures/records/mcp-server.json' with { type: 'json' };
import outputStyleFixture from '../../contracts/fixtures/records/output-style.json' with { type: 'json' };
import pluginFixture from '../../contracts/fixtures/records/plugin.json' with { type: 'json' };
import skillFixture from '../../contracts/fixtures/records/skill.json' with { type: 'json' };
import { currentRubric } from './rubrics.ts';
import { type Scorable, score } from './score.ts';

const agent = agentRecord.parse(agentFixture);
const hook = hookRecord.parse(hookFixture);
const marketplace = marketplaceRecord.parse(marketplaceFixture);
const mcpServer = mcpServerRecord.parse(mcpServerFixture);
const outputStyle = outputStyleRecord.parse(outputStyleFixture);
const plugin = pluginRecord.parse(pluginFixture);
const skill = skillRecord.parse(skillFixture);

// The fixtures were pushed on 2026-10-30T08:15:00Z; the 90-day step ends at the end of 2027-01-29.
const now = '2026-11-17';

function scored(record: Scorable, at = now) {
  return score(record, currentRubric(record.kind), at);
}

describe('total at a fixed run date', () => {
  it.each([
    ['skill', skill, 88.2],
    ['agent', agent, 80],
    ['plugin', plugin, 87.6],
    ['marketplace', marketplace, 75],
    ['hook', hook, 85],
    ['mcp-server', mcpServer, 50],
    ['output-style', outputStyle, 90],
  ])('%s', (_kind, record, total) => expect(scored(record).total).toBe(total));
});

describe('no token-cost points without content, so an empty item scores below the same item with content', () => {
  it.each([
    ['skill', { ...skill, signals: { ...skill.signals, bodyLines: 0, bodyTokens: 0 } }, skill, [68, 88.2]],
    ['agent', { ...agent, signals: { ...agent.signals, bodyLines: 0, bodyTokens: 0 } }, agent, [60, 80]],
    [
      'output-style',
      { ...outputStyle, signals: { ...outputStyle.signals, bodyLines: 0, tokens: 20 } },
      outputStyle,
      [50, 90],
    ],
    [
      'plugin',
      { ...plugin, signals: { ...plugin.signals, alwaysOnComponents: 0, componentCount: 0 } },
      plugin,
      [72.6, 87.6],
    ],
  ] satisfies [string, Scorable, Scorable, number[]][])('%s', (_kind, empty, full, totals) =>
    expect([scored(empty).total, scored(full).total]).toEqual(totals),
  );
});

it('gives each signal its points', () =>
  expect(scored(skill).parts).toEqual([
    { signal: 'lastPush', points: 10, max: 10 },
    { signal: 'recentCommits', points: 5, max: 5 },
    { signal: 'release', points: 5, max: 5 },
    { signal: 'license', points: 10, max: 10 },
    { signal: 'nameValid', points: 8, max: 8 },
    { signal: 'descriptionLength', points: 10, max: 10 },
    { signal: 'bodyLines', points: 7, max: 7 },
    { signal: 'licenseField', points: 5, max: 5 },
    { signal: 'metadataTokens', points: 4, max: 5 },
    { signal: 'bodyTokens', points: 9.2, max: 10 },
    { signal: 'safety', points: 15, max: 20 },
    { signal: 'testsShipped', points: 0, max: 5 },
  ]));

it('gives byte-identical output for two runs with the same run date', () =>
  expect(JSON.stringify(scored(plugin))).toBe(JSON.stringify(scored(structuredClone(plugin)))));

it('gives a byte-identical score at a later run date that crosses no age step', () =>
  expect(JSON.stringify(scored(skill, '2027-01-29'))).toBe(JSON.stringify(scored(skill))));

it('lowers the push-age points once the age crosses the 90-day step', () =>
  expect(scored(skill, '2027-01-30').parts.find(({ signal }) => signal === 'lastPush')).toEqual({
    signal: 'lastPush',
    points: 7.5,
    max: 10,
  }));

it('gives an archived item no maintenance points', () =>
  expect(
    scored({ ...skill, maintenance: { pushedAt: '2026-10-30T08:15:00Z', recentCommits: '5+', archived: true } }).total,
  ).toBe(68.2));

it('gives half the license points to a license no SPDX id names', () =>
  expect(scored({ ...agent, license: { source: 'github-detected', class: 'none' } }).total).toBe(75));

it('gives no license points to a license the item withholds', () =>
  expect(scored({ ...agent, license: { source: 'frontmatter', class: 'none', withheld: true } }).total).toBe(70));

it('restores safety points for a positive flag, up to the maximum', () =>
  expect(scored({ ...plugin, flags: ['hook-shell-command', 'listed-official-marketplace'] }).total).toBe(97.6));

it('refuses a record that lacks a signal of its rubric', () =>
  expect(() => scored({ ...hook, signals: { release: true } })).toThrow(
    'The hook record has no signal matchersSpecific',
  ));

it('refuses a number signal that is not finite', () =>
  expect(() => scored({ ...skill, signals: { ...skill.signals, bodyTokens: Number.NaN } })).toThrow(
    'Signal bodyTokens is not a finite number',
  ));

it('refuses a rubric of another kind', () =>
  expect(() => score(skill, currentRubric('agent'), now)).toThrow('A agent rubric cannot score a skill record'));
