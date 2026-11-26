import { Trans, useLingui } from '@lingui/react/macro';
import { Anchor, Container, Group, Text } from '@mantine/core';
import { createLink } from '@tanstack/react-router';
import { kindPluralLabels } from '../labels.ts';
import { kinds } from '../vocabulary.ts';
import { RepoWidget } from './RepoWidget.tsx';

const NavLink = createLink(Anchor);

/** The site name, the links to every list and the method page, and the repository link. */
export function SiteHeader() {
  const { i18n, t } = useLingui();
  return (
    <header className="site-header">
      <a className="skip-link" href="#main">
        <Trans id="nav.skip">Skip to content</Trans>
      </a>
      <Container size="xl" py="sm">
        <Group justify="space-between" gap="md" wrap="wrap">
          <nav aria-label={t({ id: 'nav.label', message: 'Main' })}>
            <Group gap="md" wrap="wrap">
              <NavLink to="/" activeOptions={{ exact: true, includeSearch: false }}>
                <strong>
                  <Trans id="nav.home">CedarLoom Directory</Trans>
                </strong>
              </NavLink>
              {kinds.map((kind) => (
                <NavLink
                  key={kind}
                  to="/$kind/"
                  params={{ kind }}
                  activeOptions={{ exact: true, includeSearch: false }}
                >
                  {i18n._(kindPluralLabels[kind])}
                </NavLink>
              ))}
              <NavLink to="/method/">
                <Trans id="nav.method">Method</Trans>
              </NavLink>
            </Group>
          </nav>
          <RepoWidget facts={import.meta.env.REPO_FACTS ?? {}} />
        </Group>
        {import.meta.env.VITE_FIXTURE_DATA === 'true' && (
          <Text size="sm">
            <Trans id="nav.fixtureData">
              This site shows sample data until the Directory publishes its first collected data.
            </Trans>
          </Text>
        )}
      </Container>
    </header>
  );
}
