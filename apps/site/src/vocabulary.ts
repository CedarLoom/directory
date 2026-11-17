import type { FitLabel, Kind, LicenseClass, Maintenance } from './data-types.ts';

/** Returns the list as given; it does not compile when the list misses a value of `T`. */
function everyValueOf<T extends string>() {
  return <const L extends readonly T[]>(list: L & ([T] extends [L[number]] ? unknown : never)): L => list;
}

export const kinds = everyValueOf<Kind>()([
  'marketplace',
  'plugin',
  'skill',
  'agent',
  'hook',
  'mcp-server',
  'output-style',
]);
export const licenseClasses = everyValueOf<LicenseClass>()([
  'permissive',
  'copyleft',
  'source-available',
  'none',
  'withheld',
]);
export const fitLabels = everyValueOf<FitLabel>()(['complements', 'overlaps', 'may-conflict', 'not-assessed']);
export const maintenanceStates = everyValueOf<Maintenance>()(['active', 'inactive', 'archived', 'unknown']);
