import { t } from '@lingui/core/macro';
import { createFileRoute } from '@tanstack/react-router';
import { MethodPage } from '../../method/MethodPage.tsx';
import { runMeta } from '../../meta-data.ts';

export const Route = createFileRoute('/method/')({
  head: () => ({ meta: [{ title: t({ id: 'method.title', message: 'Method | CedarLoom Directory' }) }] }),
  component: () => <MethodPage meta={runMeta} />,
});
