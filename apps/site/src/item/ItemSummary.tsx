import { useLingui } from '@lingui/react/macro';
import type { ReactNode } from 'react';
import type { ItemRecord } from '../data-types.ts';
import { LastPush, OfficialListing, SafetyLine, ScoreBadge } from '../glance/GlanceValues.tsx';
import { columnLabels, kindLabels, licenseClassLabels } from '../labels.ts';

function Fact({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <div className="glance-fact">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

/** The facts the list shows for the item, read from its record the way the collector writes its list row. */
export function ItemSummary({ record }: { record: ItemRecord }) {
  const { i18n } = useLingui();
  const licenseClass = record.license.withheld === true ? 'withheld' : record.license.class;
  // The official listing adds points, so the safety line does not count it as a flag.
  const flagCount = record.flags.filter((flag) => flag !== 'listed-official-marketplace').length;
  return (
    <dl className="glance">
      <Fact label={i18n._(columnLabels.score)}>
        <ScoreBadge score={record.score?.total} />
      </Fact>
      <Fact label={i18n._(columnLabels.kind)}>{i18n._(kindLabels[record.kind])}</Fact>
      <Fact label={i18n._(columnLabels.licenseClass)}>{i18n._(licenseClassLabels[licenseClass])}</Fact>
      <Fact label={i18n._(columnLabels.pushedAt)}>
        <LastPush pushedAt={record.maintenance?.pushedAt} />
      </Fact>
      <Fact label={i18n._(columnLabels.listedOfficial)}>
        <OfficialListing listed={record.listedIn.includes('official-marketplace')} />
      </Fact>
      <Fact label={i18n._(columnLabels.flagCount)}>
        <SafetyLine flagCount={flagCount} />
      </Fact>
    </dl>
  );
}
