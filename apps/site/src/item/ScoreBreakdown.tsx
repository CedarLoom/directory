import { Trans, useLingui } from '@lingui/react/macro';
import { Table, Title } from '@mantine/core';
import type { ItemRecord } from '../data-types.ts';
import { signalLabels } from '../labels.ts';
import { type Measured, measuredValue } from './measured-value.ts';
import { ScrollTable } from '../layout/ScrollTable.tsx';

type Score = NonNullable<ItemRecord['score']>;

function MeasuredCell({ measured }: { measured: Measured }) {
  const { i18n } = useLingui();
  switch (measured.type) {
    case 'date':
      return i18n.date(measured.value, { dateStyle: 'medium', timeZone: 'UTC' });
    case 'number':
      return i18n.number(measured.value);
    case 'yes-no':
      return measured.value ? <Trans id="item.yes">yes</Trans> : <Trans id="item.no">no</Trans>;
    case 'text':
      return measured.value;
    default:
      return <Trans id="item.notMeasured">not measured</Trans>;
  }
}

function PartRow({ record, part }: { record: ItemRecord; part: Score['parts'][number] }) {
  const { i18n } = useLingui();
  const label = signalLabels[part.signal];
  const points = i18n.number(part.points);
  const max = i18n.number(part.max);
  return (
    <Table.Tr>
      <Table.Th scope="row">{label === undefined ? part.signal : i18n._(label)}</Table.Th>
      <Table.Td>
        <MeasuredCell measured={measuredValue(record, part.signal)} />
      </Table.Td>
      <Table.Td data-numeric>
        <Trans id="item.pointsOf">
          {points} of {max}
        </Trans>
      </Table.Td>
    </Table.Tr>
  );
}

/** The points of each rubric signal beside the value the collector measured. */
export function ScoreBreakdown({ record, score }: { record: ItemRecord; score: Score }) {
  const { i18n } = useLingui();
  const total = i18n.number(score.total);
  const version = score.rubric.version;
  return (
    <section aria-labelledby="score-heading">
      <Title order={2} id="score-heading">
        <Trans id="item.scoreHeading">
          Score {total} of 100, rubric {version}
        </Trans>
      </Title>
      <ScrollTable
        headers={[
          <Trans key="item.signal" id="item.signal">
            Signal
          </Trans>,
          <Trans key="item.measured" id="item.measured">
            Measured
          </Trans>,
          <Trans key="item.points" id="item.points">
            Points
          </Trans>,
        ]}
      >
        {score.parts.map((part) => (
          <PartRow key={part.signal} record={record} part={part} />
        ))}
      </ScrollTable>
    </section>
  );
}
