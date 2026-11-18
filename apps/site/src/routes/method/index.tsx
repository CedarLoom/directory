import { t } from '@lingui/core/macro';
import { createFileRoute } from '@tanstack/react-router';
import { MethodPage } from '../../method/MethodPage.tsx';
import { runMeta } from '../../meta-data.ts';

export const Route = createFileRoute('/method/')({
  loader: async () => {
    // A dynamic import keeps the map of every rubric chunk out of the entry chunk all pages load.
    const { loadRubrics } = await import('../../method/rubrics.ts');
    return loadRubrics();
  },
  head: () => ({ meta: [{ title: t({ id: 'method.title', message: 'Method | CedarLoom Directory' }) }] }),
  component: Method,
});

function Method() {
  return <MethodPage meta={runMeta} rubrics={Route.useLoaderData()} />;
}
