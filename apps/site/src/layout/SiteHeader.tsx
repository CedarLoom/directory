import { Trans, useLingui } from '@lingui/react/macro';
import { Anchor, Container, Group } from '@mantine/core';
import { createLink } from '@tanstack/react-router';
import { kindPluralLabels } from '../labels.ts';
import { kinds } from '../vocabulary.ts';

const NavLink = createLink(Anchor);

/** The site name and the links to every list and the method page. */
export function SiteHeader() {
  const { i18n, t } = useLingui();
  return (
    <header className="site-header">
      <a className="skip-link" href="#main">
        <Trans id="nav.skip">Skip to content</Trans>
      </a>
      <Container size="xl" py="sm">
        <nav aria-label={t({ id: 'nav.label', message: 'Main' })}>
          <Group gap="md" wrap="wrap">
            <NavLink to="/" activeOptions={{ exact: true, includeSearch: false }}>
              <strong>
                <Trans id="nav.home">CedarLoom Directory</Trans>
              </strong>
            </NavLink>
            {kinds.map((kind) => (
              <NavLink key={kind} to="/$kind/" params={{ kind }} activeOptions={{ exact: true, includeSearch: false }}>
                {i18n._(kindPluralLabels[kind])}
              </NavLink>
            ))}
            <NavLink to="/method/">
              <Trans id="nav.method">Method</Trans>
            </NavLink>
          </Group>
        </nav>
      </Container>
    </header>
  );
}
