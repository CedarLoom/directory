import { t } from '@lingui/core/macro';
import { createFileRoute, notFound } from '@tanstack/react-router';
import { ItemPage } from '../../../item/ItemPage.tsx';
import { runMeta } from '../../../meta-data.ts';
import { kinds } from '../../../vocabulary.ts';

export const Route = createFileRoute('/$kind/$id/')({
  loader: async ({ params }) => {
    // A dynamic import keeps the map of every record chunk out of the entry chunk all pages load.
    const { loadItem } = await import('../../../item-data.ts');
    const kind = kinds.find((known) => known === params.kind);
    const item = kind === undefined ? undefined : await loadItem(kind, params.id);
    if (item === undefined) throw notFound();
    return item;
  },
  head: ({ loaderData }) => ({
    meta: [
      {
        title:
          loaderData === undefined
            ? undefined
            : t({ id: 'item.title', message: `${loaderData.record.name} | CedarLoom Directory` }),
      },
    ],
  }),
  component: Item,
});

function Item() {
  return <ItemPage item={Route.useLoaderData()} runAt={runMeta.runAt} />;
}
