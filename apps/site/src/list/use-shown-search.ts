import { useHydrated } from '@tanstack/react-router';

/**
 * The search the page renders: the defaults until hydration, as the prerendered HTML was rendered with them, so the
 * first client render matches the HTML whatever the address holds.
 */
export function useShownSearch<T>(search: T, defaults: T): T {
  return useHydrated() ? search : defaults;
}
