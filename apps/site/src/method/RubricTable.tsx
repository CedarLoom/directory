import type { MessageDescriptor } from '@lingui/core';
import { msg } from '@lingui/core/macro';
import { Trans, useLingui } from '@lingui/react/macro';
import { Table, Title } from '@mantine/core';
import type { Rubric } from '../data-types.ts';
import { flagLabels, kindLabels, signalLabels } from '../labels.ts';
import { ScrollTable } from '../layout/ScrollTable.tsx';

const groupLabels = {
  maintenance: msg({ id: 'group.maintenance', message: 'Maintenance' }),
  license: msg({ id: 'group.license', message: 'License' }),
  quality: msg({ id: 'group.quality', message: 'Quality' }),
  'token-cost': msg({ id: 'group.token-cost', message: 'Token cost' }),
  safety: msg({ id: 'group.safety', message: 'Safety' }),
  evals: msg({ id: 'group.evals', message: 'Evals' }),
  provenance: msg({ id: 'group.provenance', message: 'Provenance' }),
} satisfies Record<Rubric['signals'][number]['group'], MessageDescriptor>;

function Penalties({ rubric }: { rubric: Rubric }) {
  const { i18n } = useLingui();
  if (rubric.flagPenalties.length === 0) return null;
  return (
    <p>
      <Trans id="method.penalties">Safety points lost per flag:</Trans>{' '}
      {rubric.flagPenalties.map(({ flag, points }) => `${i18n._(flagLabels[flag])} ${i18n.number(points)}`).join('; ')}
    </p>
  );
}

/** The signals of one kind's rubric with their maximum points. */
export function RubricTable({ rubric }: { rubric: Rubric }) {
  const { i18n } = useLingui();
  const kind = i18n._(kindLabels[rubric.kind]);
  const version = rubric.version;
  return (
    <section aria-labelledby={`rubric-${rubric.kind}`}>
      <Title order={3} id={`rubric-${rubric.kind}`}>
        <Trans id="method.rubricHeading">
          {kind}, rubric {version}
        </Trans>
      </Title>
      <ScrollTable
        headers={[
          <Trans key="method.signal" id="method.signal">
            Signal
          </Trans>,
          <Trans key="method.group" id="method.group">
            Group
          </Trans>,
          <Trans key="method.maxPoints" id="method.maxPoints">
            Points
          </Trans>,
        ]}
      >
        {rubric.signals.map((signal) => {
          const label = signalLabels[signal.id];
          return (
            <Table.Tr key={signal.id}>
              <Table.Th scope="row">{label === undefined ? signal.id : i18n._(label)}</Table.Th>
              <Table.Td>{i18n._(groupLabels[signal.group])}</Table.Td>
              <Table.Td data-numeric>{i18n.number(signal.max)}</Table.Td>
            </Table.Tr>
          );
        })}
      </ScrollTable>
      <Penalties rubric={rubric} />
    </section>
  );
}
