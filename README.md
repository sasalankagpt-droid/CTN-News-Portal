# Capital Trust News (CTN) — Sinhala News Portal + Easy Editor CMS

Node.js 18+ Sinhala news portal with a simple backend designed for a non-technical editor.

## v1.3 highlights
- Uses the supplied **Capital Trust News** logo throughout the public site and CMS.
- Public design changed to the Capital Trust green, charcoal, grey and white visual identity.
- **උණුසුම් පුවත්** now uses a continuous left-to-right CSS ticker with two matched groups.
- Public pages no longer show Hiru News / Ada Derana branding or their image watermarks.
- Existing competitor `coverImageUrl` values were removed.
- If an editor has not uploaded a CTN/licensed cover, the portal uses a generic category image from a CC0/public-domain media library.
- Original Hiru/Ada source URL/name can still be kept inside the CMS for internal editorial traceability, but those fields are not displayed on the public article/listing/home pages.
- Quick Import still helps the editor create a draft from a Hiru/Ada link, but it **does not save or hotlink the source image**.
- Performance work removes the public `/source-image` metadata-fetch proxy, removes the permanent Server-Sent Events connection, unregisters the old service worker/cache, caches static assets, and keeps article/settings JSON in memory.
- Article view counters are persisted with a short debounce instead of synchronously writing the whole JSON file on every page view.
- Public images use lazy loading/async decoding where appropriate.

## Public website
- Sinhala homepage, categories, search, article pages and related stories
- Featured story, latest news, most-read and category sections
- Continuous breaking-news ticker
- Facebook, WhatsApp, X, device-share and copy-link icon buttons
- Save-for-later, Sinhala read-aloud hint, light/dark mode and font controls
- Responsive desktop/tablet/mobile layout
- RSS, sitemap, robots.txt, Open Graph metadata and NewsArticle structured data

## Easy editor CMS
1. Sign in to `/admin/login`.
2. Choose **පුවතක් Import කරන්න** or **නව පුවතක්**.
3. For Quick Import, paste the source URL and preview its headline/summary metadata.
4. Create the draft and rewrite/check the story in Sinhala.
5. Select a category and Breaking/Featured options.
6. Upload a CTN-owned/licensed cover image if desired. If no cover is provided, the public page uses the category fallback image.
7. Publish.

The source URL/name fields in the editor are an **internal editorial reference only** in v1.3.

## Image behaviour
The public site does not request Hiru/Ada `og:image` URLs. Generic category images currently come from Wikimedia Commons files marked CC0/public-domain. The precise source pages are recorded in `IMAGE_SOURCES.md`.

For production use, CTN should ideally maintain its own approved image library and upload those images into the CMS.

## Quick start
1. Install Node.js 18 or newer.
2. Open a terminal in this folder.
3. Run:

```bash
npm install
```

4. Copy `.env.example` to `.env` and change the admin password/secret.
5. Run:

```bash
npm start
```

6. Website: `http://localhost:3000`
7. CMS: `http://localhost:3000/admin/login`

Development defaults if no `.env` is supplied:
- Username: `editor`
- Password: `ChangeThisStrongPassword`

Change these before deployment.

## If you previously ran v1.2 on localhost
After starting v1.3, do one hard refresh (`Ctrl + F5`). v1.3 also automatically unregisters the old service worker and deletes `ctn-shell-*` browser caches so stale v1.2 CSS/JS should no longer keep returning.

## Production note
This remains a prototype/starter. Before a real newsroom deployment, replace JSON storage and the in-memory session store with production services, add HTTPS-only cookies, CSRF protection, backups, audit logs, monitoring, media storage/CDN, permission/rights management, malware scanning and accessibility/security testing.

## Render / GitHub deployment

This build includes `render.yaml`, `.gitignore`, and `DEPLOY_RENDER.md` for a simple Render Free deployment. See `DEPLOY_RENDER.md` for the exact steps. Never commit a real `.env` file or `node_modules`.

**Persistence note:** the current CMS uses JSON/local uploads. Render Free has ephemeral local storage, so online CMS changes are suitable for testing/demo use unless storage is migrated to a persistent database/object store.
