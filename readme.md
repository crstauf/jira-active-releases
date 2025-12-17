# My Active Jira Releases — Cloudflare Worker

Your personal, real-time, **clickable dashboard** of every unreleased (active) Jira version across your projects.

**Just bookmark this URL — it’s all you’ll ever need:**

`https://your-worker.workers.dev`

Opens instantly to a beautiful HTML page with fully clickable release links.
Always up-to-date. 100 % private. Zero maintenance.

## Features

- Default output = **clickable HTML** (no query param needed)
- Optional formats:
  - `?format=markdown` **or** `?format=md` → clean Markdown table with clickable project and version links
  - `?format=json` → structured JSON data (ideal for scripts or integrations)
- Shows **all configured projects**, even those with no active releases
- Caches results for 6 hours (with stale-while-revalidate) for fast loads
- `?force=1` bypasses cache for an immediate refresh
- Works even if you lack the global “Browse Projects” permission
- Runs on Cloudflare Workers — free tier forever
- Secrets stored securely

## Deployment Options

You can deploy and manage your instance in two ways:

### Option 1: One-Click GitHub Actions Deployment (Recommended for most users)

Perfect if you want a fully managed, repeatable deployment without installing anything locally.

1. Fork this repository to your GitHub account
2. In Cloudflare dashboard:
   - Go to your profile → **API Tokens** → Create token → Use template **"Edit Cloudflare Workers"**
   - Copy your **Account ID** (found in the three-dot menu of the account name)
3. In your forked repo → **Settings → Secrets and variables → Actions → New repository secret**
   Add the following secrets:
   - `CLOUDFLARE_API_TOKEN` → your token from step two
   - `CLOUDFLARE_ACCOUNT_ID` → your account ID (recommended)
   - `JIRA_SITE` → e.g. `yourcompany.atlassian.net`
   - `JIRA_EMAIL` → your Atlassian email
   - `JIRA_TOKEN` → API token from https://id.atlassian.com/manage-profile/security/api-tokens
   - `JIRA_PROJECTS` → space or comma-separated project keys (case-insensitive)  
     Example: `WEB MOBILE BACKEND DATA INFRA AIOPS`
4. Go to the **Actions** tab → Select **"Deploy"** → Click **Run workflow**

Your personal Worker is now live!  
Re-run the workflow anytime to:
- Update the code (after pulling latest changes)
- Update any secrets (like adding/removing projects)

### Option 2: Local Development & Deployment (with Wrangler CLI)

Ideal if you want to test changes locally or develop new features.

1. Clone your forked repo
   ```bash
   git clone https://github.com/your-username/jira-active-releases.git
   cd jira-active-releases
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Login to Cloudflare:
   ```bash
   npx wrangler login
   ```
4. Add your secrets:
   ```bash
   npx wrangler secret put JIRA_SITE
   npx wrangler secret put JIRA_EMAIL
   npx wrangler secret put JIRA_TOKEN
   npx wrangler secret put JIRA_PROJECTS
   ```
   (You can re-run these anytime to update values)
5. Test locally:
   ```bash
   npm run dev
   ```
   → Opens a local dev server with live reload
6. Deploy:
   ```bash
   npm run deploy
   ```

To update secrets later: re-run the `wrangler secret put` commands and deploy again.

## Customizing the Worker Configuration

The repository includes a `wrangler.sample.jsonc` file with recommended defaults.

To deploy successfully and use your own Worker name/settings:

1. Copy `wrangler.sample.jsonc` to `wrangler.jsonc` in the project root
2. Edit `wrangler.jsonc` — at minimum, change the `"name"` field to something unique (e.g., "my-jira-releases")
3. Commit `wrangler.jsonc` (it's safe — contains no secrets)

This gives you full control over all Wrangler settings (name, routes, bindings, placement, etc.) while avoiding merge conflicts when pulling future updates from this repository (just don't edit the sample file).

**Wrangler requires `wrangler.jsonc` to exist for deployment** — if missing, deploy will fail with a clear error.

## Updating Projects

Whichever method you use:
- Just update the `JIRA_PROJECTS` value
- Re-deploy (via GitHub Actions or `npm run deploy`)
- No code changes needed

## Format Details

### HTML (default)
- Full styled table
- Project links → Jira project summary
- Version links → direct release page
- Footer shows last update time and force-refresh link

### Markdown (`?format=markdown` or `?format=md`)
- Simple, readable Markdown table
- Clickable project and version links
- Projects with no unreleased versions show "—"
- Clean output — great for pasting into tickets, Slack, Notion, etc.

### JSON (`?format=json`)
Returns an array of projects (all configured projects included):

```json
[
  {
    "project": "WEB",
    "projectUrl": "https://yourcompany.atlassian.net/jira/software/c/projects/WEB/summary",
    "releases": [
      {
        "version": "Release 11",
        "url": "https://yourcompany.atlassian.net/projects/WEB/versions/12345"
      }
    ]
  },
  {
    "project": "MOBILE",
    "projectUrl": "https://yourcompany.atlassian.net/jira/software/c/projects/MOBILE/summary",
    "releases": []
  }
]
```

Perfect for scripting or feeding into other tools.

## You’re all set!

Enjoy the win — you earned it!