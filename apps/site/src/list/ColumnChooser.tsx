import { Trans, useLingui } from '@lingui/react/macro';
import { Checkbox, SimpleGrid } from '@mantine/core';
import { columnLabels } from '../labels.ts';
import { type ColumnId, columnIds } from '../list-search.ts';

interface Props {
  value: readonly ColumnId[];
  onChange: (value: ColumnId[]) => void;
}

/** The visible columns, in table order; the last one cannot be hidden. */
export function ColumnChooser({ value, onChange }: Props) {
  const { i18n } = useLingui();
  return (
    <Checkbox.Group
      label={<Trans id="columns.label">Columns</Trans>}
      value={[...value]}
      onChange={(next) => {
        const chosen = columnIds.filter((id) => next.includes(id));
        if (chosen.length > 0) onChange(chosen);
      }}
    >
      <SimpleGrid cols={{ base: 1, xs: 2, md: 5 }} spacing="xs" mt="xs">
        {columnIds.map((id) => (
          <Checkbox
            key={id}
            value={id}
            label={i18n._(columnLabels[id])}
            disabled={value.length === 1 && value[0] === id}
          />
        ))}
      </SimpleGrid>
    </Checkbox.Group>
  );
}
