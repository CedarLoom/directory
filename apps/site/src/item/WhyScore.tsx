import { Trans, useLingui } from '@lingui/react/macro';
import { List, Text, Title } from '@mantine/core';
import type { ItemRecord, Rubric } from '../data-types.ts';
import { flagLabels, groupLabels, groupSentences, signalName } from '../labels.ts';
import { type GroupScore, groupScores } from './group-scores.ts';

type Score = NonNullable<ItemRecord['score']>;

/** Each flag of the item that the rubric takes points off for, or gives points back for. */
function FlagPoints({ rubric, flags }: { rubric: Rubric; flags: ItemRecord['flags'] }) {
  const { i18n } = useLingui();
  const penalties = rubric.flagPenalties.filter(({ flag }) => flags.includes(flag));
  if (penalties.length === 0) return null;
  return (
    <List size="sm">
      {penalties.map(({ flag, points: penalty }) => {
        const points = i18n.number(-penalty, { signDisplay: 'exceptZero' });
        const label = i18n._(flagLabels[flag]);
        return (
          <List.Item key={flag}>
            <Trans id="item.flagPoints">
              {points} points: {label}
            </Trans>
          </List.Item>
        );
      })}
    </List>
  );
}

function GroupRow({ group, record, rubric }: { group: GroupScore; record: ItemRecord; rubric: Rubric }) {
  const { i18n } = useLingui();
  const points = i18n.number(group.points, { maximumFractionDigits: 1 });
  const max = i18n.number(group.max, { maximumFractionDigits: 1 });
  const signals = new Intl.ListFormat(i18n.locale, { type: 'conjunction' }).format(
    group.signals.map((id) => signalName(i18n, id)),
  );
  const share = (group.points / group.max) * 100;
  return (
    <li className="score-group">
      <div className="score-group-head">
        <span className="score-group-name">{i18n._(groupLabels[group.group])}</span>
        <span data-numeric>
          <Trans id="item.groupPoints">
            {points} of {max} points
          </Trans>
        </span>
      </div>
      {/* The points beside it say what the bar shows. */}
      <div className="score-bar" aria-hidden>
        <div className="score-bar-fill" style={{ inlineSize: `${share}%` }} />
      </div>
      <Text size="sm">{i18n._({ ...groupSentences[group.group], values: { signals } })}</Text>
      {group.group === 'safety' && <FlagPoints rubric={rubric} flags={record.flags} />}
    </li>
  );
}

/** The score per rubric group: points earned of points possible, what each group rewards and every flag's points. */
export function WhyScore({ record, score, rubric }: { record: ItemRecord; score: Score; rubric: Rubric }) {
  const { i18n } = useLingui();
  const total = i18n.number(score.total, { maximumFractionDigits: 1 });
  const version = rubric.version;
  return (
    <section aria-labelledby="why-heading">
      <Title order={2} id="why-heading">
        <Trans id="item.whyHeading">Why this score</Trans>
      </Title>
      <Text>
        <Trans id="item.whyIntro">
          {total} of 100 points, from the published rubric {version} of its kind. The table further down shows every
          signal.
        </Trans>
      </Text>
      <ul className="score-groups">
        {groupScores(rubric, score.parts).map((group) => (
          <GroupRow key={group.group} group={group} record={record} rubric={rubric} />
        ))}
      </ul>
    </section>
  );
}
