interface ImportMetaEnv {
  /** Stars and forks of the Directory's repository, read once per build by scripts/repo-facts.ts. */
  readonly REPO_FACTS?: { readonly stars?: number; readonly forks?: number };
  /** `true` when the build shows the fixture data, as no collected data is published yet. */
  readonly VITE_FIXTURE_DATA?: string;
}
