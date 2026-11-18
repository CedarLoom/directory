import { t } from '@lingui/core/macro';
import { useLingui } from '@lingui/react/macro';
import { createFileRoute, notFound, stripSearchParams } from '@tanstack/react-router';
import { useMemo } from 'react';
import type { Kind } from '../../data-types.ts';
import { i18n } from '../../i18n.ts';
import { rows } from '../../index-data.ts';
import { kindPluralLabels } from '../../labels.ts';
import { ListPage } from '../../list/ListPage.tsx';
import { useShownSearch } from '../../list/use-shown-search.ts';
import { listSearch } from '../../list-search.ts';
import { runMeta } from '../../meta-data.ts';
import { kinds } from '../../vocabulary.ts';

// A kind's list has no kind filter.
const kindSearch = listSearch.omit({ kinds: true });
const kindDefaults = kindSearch.parse({});
// One array for every render, so the list page keeps its filtered rows across a sort or page change.
const noKinds: Kind[] = [];

export const Route = createFileRoute('/$kind/')({
  validateSearch: kindSearch,
  search: { middlewares: [stripSearchParams(kindDefaults)] },
  loader: ({ params }) => {
    const kind = kinds.find((known) => known === params.kind);
    if (kind === undefined) throw notFound();
    return kind;
  },
  head: ({ loaderData }) => ({
    meta: [
      {
        title:
          loaderData === undefined
            ? undefined
            : t({ id: 'kindList.title', message: `${i18n._(kindPluralLabels[loaderData])} | CedarLoom Directory` }),
      },
    ],
  }),
  component: KindItems,
});

function KindItems() {
  const { i18n: active } = useLingui();
  const kind = Route.useLoaderData();
  const search = useShownSearch(Route.useSearch(), kindDefaults);
  const navigate = Route.useNavigate();
  const kindRows = useMemo(() => rows.filter((row) => row.kind === kind), [kind]);
  // The list page filters again whenever this object changes.
  const shownSearch = useMemo(() => ({ ...search, kinds: noKinds }), [search]);
  return (
    <ListPage
      title={active._(kindPluralLabels[kind])}
      rows={kindRows}
      showKinds={false}
      runAt={runMeta.runAt}
      search={shownSearch}
      onSearchChange={(patch, replace) => navigate({ search: (previous) => ({ ...previous, ...patch }), replace })}
    />
  );
}
