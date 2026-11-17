import { t } from '@lingui/core/macro';
import { Trans } from '@lingui/react/macro';
import { createFileRoute, stripSearchParams } from '@tanstack/react-router';
import { rows } from '../index-data.ts';
import { ListPage } from '../list/ListPage.tsx';
import { useShownSearch } from '../list/use-shown-search.ts';
import { defaultSearch, listSearch } from '../list-search.ts';
import { runMeta } from '../meta-data.ts';

export const Route = createFileRoute('/')({
  validateSearch: listSearch,
  // Default values stay out of the address, so the plain list has a plain link.
  search: { middlewares: [stripSearchParams(defaultSearch)] },
  head: () => ({ meta: [{ title: t({ id: 'list.title', message: 'All items | CedarLoom Directory' }) }] }),
  component: AllItems,
});

function AllItems() {
  const search = useShownSearch(Route.useSearch(), defaultSearch);
  const navigate = Route.useNavigate();
  return (
    <ListPage
      title={<Trans id="list.heading">Claude Code extensions</Trans>}
      rows={rows}
      showKinds
      runAt={runMeta.runAt}
      search={search}
      onSearchChange={(patch, replace) => navigate({ search: (previous) => ({ ...previous, ...patch }), replace })}
    />
  );
}
