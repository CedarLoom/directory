import type { FitLabel, Kind, LicenseClass, Maintenance } from './data-types.ts';

export const kinds = [
  'marketplace',
  'plugin',
  'skill',
  'agent',
  'hook',
  'mcp-server',
  'output-style',
] as const satisfies Kind[];
export const licenseClasses = ['permissive', 'copyleft', 'source-available', 'none'] as const satisfies LicenseClass[];
export const fitLabels = ['complements', 'overlaps', 'may-conflict', 'not-assessed'] as const satisfies FitLabel[];
export const maintenanceStates = ['active', 'inactive', 'archived', 'unknown'] as const satisfies Maintenance[];
