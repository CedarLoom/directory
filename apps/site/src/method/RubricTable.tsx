import { Trans, useLingui } from '@lingui/react/macro';
import { Table, Title } from '@mantine/core';
import type { Rubric } from '../data-types.ts';
import { flagLabels, groupLabels, kindLabels, signalName } from '../labels.ts';
import { ScrollTable } from '../layout/ScrollTable.tsx';

/** The signals that give points only when another signal of the record is true or above 0, by that signal. */
function Gates({ rubric }: { rubric: Rubric }) {
  const { i18n } = useLingui();
  const gates = new Map<string, string[]>();
  for (const { id, gate } of rubric.signals)
    if (gate !== undefined) gates.set(gate, [...(gates.get(gate) ?? []), signalName(i18n, id)]);
  return [...gates].map(([gateId, gated]) => {
    const signals = gated.join(', ');
    const gate = signalName(i18n, gateId);
    return (
      <p key={gateId}>
        <Trans id="method.gate">
          {signals}: no points without {gate}, so an empty item gets none.
        </Trans>
      </p>
    );
  });
}

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
        {rubric.signals.map((signal) => (
          <Table.Tr key={signal.id}>
            <Table.Th scope="row">{signalName(i18n, signal.id)}</Table.Th>
            <Table.Td>{i18n._(groupLabels[signal.group])}</Table.Td>
            <Table.Td data-numeric>{i18n.number(signal.max)}</Table.Td>
          </Table.Tr>
        ))}
      </ScrollTable>
      <Gates rubric={rubric} />
      <Penalties rubric={rubric} />
    </section>
  );
}
