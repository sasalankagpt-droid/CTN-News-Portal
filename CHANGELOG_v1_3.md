# CTN News Portal v1.3

## Requested changes completed
- Replaced the CTN text badge with the supplied Capital Trust News logo on public header/footer and CMS screens.
- Changed the public visual system to a Capital Trust-inspired green/charcoal/grey/white palette.
- Rebuilt the **උණුසුම් පුවත්** ticker as a continuous left-to-right loop and removed hover/reduced-motion rules that could make it appear stopped.
- Removed Hiru/Ada cover-image hotlinks and the public source-image proxy.
- Public homepage/listing/article pages no longer show competitor source names/links. Internal source metadata remains available to editors.
- Added generic category-level CC0/public-domain fallback images for Local, World, Business, Markets, Sports, Entertainment, Technology and Reports, plus a train-specific fallback.
- Quick Import no longer stores the source publisher's OG image.
- Removed the permanent EventSource connection used for ticker updates.
- Added automatic cleanup of the previous service worker/cache and removed service-worker page caching.
- Added versioned CSS/JS URLs so localhost does not reuse stale v1.2 assets.
- Moved static files before the dynamic rate limiter and increased static cache time.
- Cached articles/settings in memory and debounced article-view writes to disk.
- Added lazy-loading/async decoding hints to listing/card images.

## Important first run after v1.2
Start v1.3 and press `Ctrl + F5` once in the browser.
