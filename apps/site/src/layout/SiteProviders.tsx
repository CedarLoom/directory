import { I18nProvider } from '@lingui/react';
import { createTheme, MantineProvider } from '@mantine/core';
import type { ReactNode } from 'react';
import { i18n } from '../i18n.ts';
import { cssVariables, theme } from '../theme/theme.generated.ts';

const mantineTheme = createTheme(theme);

/** The translations and the theme every page and story renders in. */
export function SiteProviders({ children }: { children: ReactNode }) {
  return (
    <I18nProvider i18n={i18n}>
      <MantineProvider theme={mantineTheme} defaultColorScheme="auto" cssVariablesResolver={() => cssVariables}>
        {children}
      </MantineProvider>
    </I18nProvider>
  );
}
