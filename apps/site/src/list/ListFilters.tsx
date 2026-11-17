import type { MessageDescriptor } from '@lingui/core';
import { Trans, useLingui } from '@lingui/react/macro';
import { Checkbox, Group, NativeSelect, SimpleGrid, Stack } from '@mantine/core';
import type { ReactNode } from 'react';
import { fitLabels, kindLabels, licenseClassLabels, maintenanceLabels } from '../labels.ts';
import type { ListFilters as Filters } from '../list-search.ts';
import * as vocabulary from '../vocabulary.ts';
import { BoundInput } from './BoundInput.tsx';
import { SearchInput } from './SearchInput.tsx';

interface Props {
  filters: Filters;
  tags: readonly string[];
  /** False on a kind's own list, which filters by its path. */
  showKinds: boolean;
  onChange: (patch: Partial<Filters>) => void;
}

function Choices<T extends string>(props: {
  label: ReactNode;
  options: readonly T[];
  labels: Record<T, MessageDescriptor>;
  value: readonly T[];
  onChange: (value: T[]) => void;
}) {
  const { i18n } = useLingui();
  return (
    <Checkbox.Group
      label={props.label}
      value={[...props.value]}
      onChange={(value) => props.onChange(props.options.filter((option) => value.includes(option)))}
    >
      <Stack gap="xs" mt="xs">
        {props.options.map((option) => (
          <Checkbox key={option} value={option} label={i18n._(props.labels[option])} />
        ))}
      </Stack>
    </Checkbox.Group>
  );
}

function Bounds({ filters, onChange }: Pick<Props, 'filters' | 'onChange'>) {
  return (
    <Stack gap="xs">
      <Group grow align="end">
        <BoundInput
          label={<Trans id="filter.scoreMin">Score from</Trans>}
          integer={false}
          min={0}
          max={100}
          value={filters.scoreMin}
          onChange={(scoreMin) => onChange({ scoreMin })}
        />
        <BoundInput
          label={<Trans id="filter.scoreMax">Score to</Trans>}
          integer={false}
          min={0}
          max={100}
          value={filters.scoreMax}
          onChange={(scoreMax) => onChange({ scoreMax })}
        />
      </Group>
      <Group grow align="end">
        <BoundInput
          label={<Trans id="filter.starsMin">Stars from</Trans>}
          min={0}
          value={filters.starsMin}
          onChange={(starsMin) => onChange({ starsMin })}
        />
        <BoundInput
          label={<Trans id="filter.starsMax">Stars to</Trans>}
          min={0}
          value={filters.starsMax}
          onChange={(starsMax) => onChange({ starsMax })}
        />
      </Group>
      <BoundInput
        label={<Trans id="filter.gainMin">Stars gained in 30 days, at least</Trans>}
        value={filters.gainMin}
        onChange={(gainMin) => onChange({ gainMin })}
      />
    </Stack>
  );
}

function SearchAndToggles({ filters, tags, onChange }: Omit<Props, 'showKinds'>) {
  const { t } = useLingui();
  return (
    <Stack gap="xs">
      <SearchInput
        label={<Trans id="filter.q">Search names, owners and tags</Trans>}
        value={filters.q}
        onChange={(q) => onChange({ q })}
      />
      <NativeSelect
        label={<Trans id="filter.tag">Category tag</Trans>}
        value={filters.tag}
        data={[
          { value: '', label: t({ id: 'filter.anyTag', message: 'Any tag' }) },
          // A tag from the address that no row has stays shown, so it can be cleared.
          ...(filters.tag === '' || tags.includes(filters.tag) ? tags : [filters.tag, ...tags]),
        ]}
        onChange={(event) => onChange({ tag: event.currentTarget.value })}
      />
      <Checkbox
        label={<Trans id="filter.noFlags">Only items without safety flags</Trans>}
        checked={filters.noFlags}
        onChange={(event) => onChange({ noFlags: event.currentTarget.checked })}
      />
      <Checkbox
        label={<Trans id="filter.official">Only items listed in the official marketplace</Trans>}
        checked={filters.official}
        onChange={(event) => onChange({ official: event.currentTarget.checked })}
      />
    </Stack>
  );
}

/** The filter fields of the list; each change reports only the fields it sets. */
export function ListFilters({ filters, tags, showKinds, onChange }: Props) {
  return (
    <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="lg">
      <SearchAndToggles filters={filters} tags={tags} onChange={onChange} />
      <Bounds filters={filters} onChange={onChange} />
      {showKinds && (
        <Choices
          label={<Trans id="filter.kinds">Kind</Trans>}
          options={vocabulary.kinds}
          labels={kindLabels}
          value={filters.kinds}
          onChange={(kinds) => onChange({ kinds })}
        />
      )}
      <Choices
        label={<Trans id="filter.license">License</Trans>}
        options={vocabulary.licenseClasses}
        labels={licenseClassLabels}
        value={filters.license}
        onChange={(license) => onChange({ license })}
      />
      <Choices
        label={<Trans id="filter.fit">CedarLoom fit</Trans>}
        options={vocabulary.fitLabels}
        labels={fitLabels}
        value={filters.fit}
        onChange={(fit) => onChange({ fit })}
      />
      <Choices
        label={<Trans id="filter.maintenance">Maintenance</Trans>}
        options={vocabulary.maintenanceStates}
        labels={maintenanceLabels}
        value={filters.maintenance}
        onChange={(maintenance) => onChange({ maintenance })}
      />
    </SimpleGrid>
  );
}
