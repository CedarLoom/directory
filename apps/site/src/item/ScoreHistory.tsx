import { Trans, useLingui } from '@lingui/react/macro';
import { Table, Title } from '@mantine/core';
import type { HistoryFile } from '../data-types.ts';
import { ScrollTable } from '../layout/ScrollTable.tsx';

/** The score history, newest first, with each change of rubric version marked. */
export function ScoreHistory({ history }: { history: HistoryFile }) {
  const { i18n } = useLingui();
  const entries = history.entries.map((entry, index) => ({
    ...entry,
    rubricChanged: index > 0 && history.entries[index - 1]?.rubric !== entry.rubric,
  }));
  return (
    <section aria-labelledby="history-heading">
      <Title order={2} id="history-heading">
        <Trans id="item.historyHeading">Score history</Trans>
      </Title>
      <ScrollTable
        headers={[
          <Trans key="item.historyDate" id="item.historyDate">
            Date
          </Trans>,
          <Trans key="item.historyRubric" id="item.historyRubric">
            Rubric
          </Trans>,
          <Trans key="item.historyTotal" id="item.historyTotal">
            Score
          </Trans>,
        ]}
      >
        {entries.toReversed().map((entry) => (
          <Table.Tr key={`${entry.date}-${entry.rubric}`}>
            <Table.Th scope="row">{i18n.date(entry.date, { dateStyle: 'medium', timeZone: 'UTC' })}</Table.Th>
            <Table.Td className={entry.rubricChanged ? 'history-change' : undefined}>
              {entry.rubricChanged ? <Trans id="item.rubricChanged">{entry.rubric} (new rubric)</Trans> : entry.rubric}
            </Table.Td>
            <Table.Td data-numeric>{i18n.number(entry.total)}</Table.Td>
          </Table.Tr>
        ))}
      </ScrollTable>
    </section>
  );
}
