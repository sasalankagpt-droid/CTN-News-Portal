# CTN News Portal — GitHub + Render Free Deployment

This package is prepared for GitHub and Render.

## Files added/changed for hosting

- `.gitignore` — prevents `node_modules` and `.env` secrets from being uploaded.
- `render.yaml` — tells Render how to build/start CTN and creates a health check.
- `.env.example` — safe example only; never put your real password here.
- `server.js` — supports Render HTTPS/proxy sessions, automatic Render hostname, `/health`, and clean shutdown.
- `public/uploads/.gitkeep` — keeps the uploads folder in Git while ignoring runtime uploads.

## GitHub upload

Upload the CONTENTS of this folder to the repository root. `server.js`, `package.json`, and `render.yaml` must appear on the first page of the GitHub repository.

Do not upload:
- `node_modules/`
- `.env`

## Render deployment (recommended simple method)

1. Sign in to Render using GitHub.
2. New + → Blueprint.
3. Select the repository containing this project.
4. Render detects `render.yaml`.
5. When prompted, enter:
   - `ADMIN_USER`: your admin username
   - `ADMIN_PASSWORD`: a strong unique password
6. `SESSION_SECRET` is generated automatically by Render.
7. Apply/Create Blueprint and wait for the deployment to become Live.
8. Open the generated `https://...onrender.com` URL.
9. Admin login is at `/admin/login`.

## Important free-tier limitation

CTN v1.3 stores articles/settings in JSON files and uploaded media on the local filesystem. Render Free uses an ephemeral filesystem. The starting content from GitHub is deployed correctly, but edits made in the online CMS and uploaded files can be lost after a restart/redeploy.

For a permanent production CMS, migrate article/settings storage to a database and uploaded media to persistent object storage (for example Cloudflare D1 + R2).
