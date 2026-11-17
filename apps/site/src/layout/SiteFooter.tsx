import { Trans, useLingui } from '@lingui/react/macro';
import { Container, Text } from '@mantine/core';
import { runMeta } from '../meta-data.ts';

/** The data date and the independence statement on every page. */
export function SiteFooter() {
  const { i18n } = useLingui();
  const runDate = i18n.date(runMeta.runAt, { dateStyle: 'long', timeZone: 'UTC' });
  return (
    <footer className="site-footer">
      <Container size="xl" py="lg">
        <Text size="sm" c="dimmed">
          <Trans id="footer.run">Data collected on {runDate}.</Trans>{' '}
          <Trans id="footer.affiliation">
            The CedarLoom Directory is not affiliated with or endorsed by Anthropic.
          </Trans>
        </Text>
      </Container>
    </footer>
  );
}
