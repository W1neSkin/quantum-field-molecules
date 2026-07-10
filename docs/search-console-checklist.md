# Google Search Console measurement

Use the URL-prefix property:
`https://w1neskin.github.io/quantum-field-molecules/`.

No ranking claim should be made immediately after deployment. Google must first
crawl the new static pages. Record the baseline on release day, then compare
the same date ranges after 7 and 28 days.

## Release-day checks

1. Submit `sitemap.xml`.
2. Confirm that Search Console discovers all 14 canonical URLs.
3. Inspect these representative URLs:
   - `/`
   - `/ru/`
   - `/learn/h2-dissociation/`
   - `/ru/learn/h2-dissociation/`
   - `/validation/`
4. Request indexing only if a representative URL is still unknown to Google.
5. Save the Performance report for the previous 28 days as the baseline.

## Metrics to record

- Total web-search clicks.
- Total impressions.
- Average click-through rate.
- Average position.
- Number of indexed canonical pages.
- Pages excluded as duplicate, crawled but not indexed, or discovered but not
  indexed.

Keep the query and page filters unchanged between measurements. Review English
and Russian page groups separately:

- English: URLs matching `/learn/` plus `/validation/`.
- Russian: URLs matching `/ru/`.

## Query groups

Track groups instead of one exact phrase:

- `hartree fock browser`, `online hartree fock`, `hartree fock calculator`
- `h2 dissociation rhf uhf`, `full ci h2`
- `electron density molecular orbitals`, `elf chemistry`
- `quantum field theory molecules`, `molecular qed`
- Russian equivalents for each group

## Interpretation

- Rising impressions with stable position means Google is testing the new
  pages; avoid rewriting titles too early.
- Impressions without clicks suggest checking the title and description for
  the affected page.
- A page that remains crawled but not indexed after 28 days may need stronger
  internal links or more original evidence.
- Query-string laboratory states are not separate SEO pages. Their canonical
  target is `/`; the static guide or validation page is the indexable source.

Do not compare partial weeks or mix Search, Discover and image data.
