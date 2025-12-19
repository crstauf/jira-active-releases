# My Active Jira Releases — Cloudflare Worker

> Created by Caleb Stauffer and Grok
> [crstauf/jira-active-releases](https://github.com/crstauf/jira-active-releases)

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

> [!NOTE]
> Because the source repository is public and GitHub does not allow private forks of public repos, use GitHub's **Import Repository** tool to create a private copy. 

1. Go to https://github.com/new/import
2. Enter the repository URL: `https://github.com/crstauf/jira-active-releases`
3. Choose a name for your new repository (e.g., `jira-active-releases`)
4. Select **Private** (so your `wrangler.jsonc` stays hidden)
5. Click **Begin import** and wait for it to complete

6. In Cloudflare dashboard:
   - Go to your profile → **API Tokens** → Create token → Use template **"Edit Cloudflare Workers"**
   - Copy your **Account ID** (found in the three-dot menu of the account name)

7. In your new (private) imported repo → **Settings → Secrets and variables → Actions → New repository secret**
   Add the following secrets:
   - `CLOUDFLARE_API_TOKEN` → your token from step 6
   - `CLOUDFLARE_ACCOUNT_ID` → your account ID (recommended)
   - `JIRA_SITE` → e.g. `yourcompany.atlassian.net`
   - `JIRA_EMAIL` → your Atlassian email
   - `JIRA_TOKEN` → API token from https://id.atlassian.com/manage-profile/security/api-tokens
   - `JIRA_PROJECTS` → space or comma-separated project keys (case-insensitive)  
     Example: `WEB MOBILE BACKEND DATA INFRA AIOPS`

8. Go to the **Actions** tab → Select **"Deploy Jira Releases Worker"** → Click **Run workflow**

Your personal Worker is now live!  
Re-run the workflow anytime to:
- Update the code (after pulling latest changes from the source repo)
- Update any secrets (like adding/removing projects)

### Option 2: Local Development & Deployment (with Wrangler CLI)

Ideal if you want to test changes locally or develop new features.

1. Clone your private imported repo
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
3. Commit `wrangler.jsonc` (safe in your private repo — contains no secrets)

This gives you full control over all Wrangler settings (name, routes, bindings, placement, etc.).

**Wrangler requires `wrangler.jsonc` to exist for deployment** — if missing, deploy will fail with a clear error.

## Updating the Code from Upstream

Since you imported the repo (instead of forking), to get future updates:

```bash
git remote add upstream https://github.com/crstauf/jira-active-releases.git
git fetch upstream
git merge upstream/main  # or rebase if preferred
```

Then re-deploy.

## Updating Projects

Whichever method you use:
- Just update the `JIRA_PROJECTS` value
- Re-deploy (via GitHub Actions or `npm run deploy`)
- No code changes needed

## Format Details

All formats include links to switch between representations and to the source repository.

### HTML (default)
- Full styled table
- Project links → Jira project summary
- Version links → direct release page
- Footer includes:
  - Update timestamp
  - Force refresh link
  - Links to Markdown and JSON formats
  - Link to the [source repository](https://github.com/crstauf/jira-active-releases)

### Markdown (`?format=markdown` or `?format=md`)
- Simple, readable Markdown table
- Clickable project and version links
- Projects with no unreleased versions show "—"
- Footer with:
  - Update timestamp
  - Links to HTML and JSON formats
  - Link to the source repository
- Clean output — great for pasting into tickets, Slack, Notion, etc.

### JSON (`?format=json`)
Returns an object with metadata and project data:

```json
{
  "_meta": {
    "generated_at": "2025-12-19 14:32:10 UTC",
    "source": "https://github.com/crstauf/jira-active-releases",
    "formats": {
      "html": "https://your-domain.com/",
      "markdown": "https://your-domain.com/?format=md",
      "json": "https://your-domain.com/?format=json"
    }
  },
  "projects": [
    {
      "project": "WEB",
      "projectUrl": "https://yourcompany.atlassian.net/jira/software/c/projects/WEB/summary",
      "releases": [
        {
          "version": "Release 11",
          "url": "https://yourcompany.atlassian.net/projects/WEB/versions/12345"
        }
      ]
    }
  ]
}
```

Perfect for scripting or feeding into other tools — parsers can safely ignore `_meta`.

## You’re all set!

Enjoy the win — you earned it!