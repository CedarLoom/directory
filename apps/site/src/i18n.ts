import { i18n } from '@lingui/core';
import { messages } from './locales/en/messages.po';

// English only: the catalog is activated once, before the first render on the server and in the browser.
i18n.loadAndActivate({ locale: 'en', messages });

export { i18n };
