import names from './license-names.json' with { type: 'json' };

// SPDX license-list-data v3.29.0: the full name of each license id that is not deprecated, the list of the contracts' ids.
const fullNames: Readonly<Record<string, string>> = names;

const folded = (value: string) => value.toLowerCase().replace(/\s+/g, ' ').trim();

const idsByName: ReadonlyMap<string, string> = new Map(
  Object.entries(fullNames).map(([id, name]) => [folded(name), id]),
);

/** The SPDX id of the license whose full name in the SPDX License List the value is, in any case and spacing. */
export function licenseNameId(value: string): string | undefined {
  return idsByName.get(folded(value));
}
