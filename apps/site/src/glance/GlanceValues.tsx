import { Plural, Trans, useLingui } from '@lingui/react/macro';
import { scoreBandLabels } from '../labels.ts';
import { scoreBand } from '../score-band.ts';

/** The score with its band named in words, so the band color is never the only sign of it. */
export function ScoreBadge({ score }: { score: number | undefined }) {
  const { i18n } = useLingui();
  if (score === undefined) return <Trans id="glance.notScored">not scored</Trans>;
  const band = scoreBand(score);
  return (
    <span className="score-badge" data-band={band}>
      <span className="score-badge-number">{i18n.number(score, { maximumFractionDigits: 1 })}</span>
      <span>{i18n._(scoreBandLabels[band])}</span>
    </span>
  );
}

export function LastPush({ pushedAt }: { pushedAt: string | undefined }) {
  const { i18n } = useLingui();
  if (pushedAt === undefined) return <Trans id="list.notKnown">not known</Trans>;
  return i18n.date(pushedAt, { dateStyle: 'medium', timeZone: 'UTC' });
}

export function OfficialListing({ listed }: { listed: boolean }) {
  return listed ? <Trans id="list.listed">listed</Trans> : <Trans id="list.notListed">not listed</Trans>;
}

/** The safety flags as a short line; the official listing is not counted, as it adds points. */
export function SafetyLine({ flagCount }: { flagCount: number }) {
  return <Plural id="glance.flags" value={flagCount} _0="No flags" one="# flag" other="# flags" />;
}
