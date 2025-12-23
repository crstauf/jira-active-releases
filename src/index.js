export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    let format = url.searchParams.get("format") || "html";
    if (format === "md") format = "markdown";

    const bypassCache = url.searchParams.has("force");

    const SITE = env.JIRA_SITE;
    const EMAIL = env.JIRA_EMAIL;
    const TOKEN = env.JIRA_TOKEN;
    const RAW_PROJECTS = env.JIRA_PROJECTS || "";

    if (!SITE || !EMAIL || !TOKEN || !RAW_PROJECTS) {
      return new Response("Missing required environment variables (JIRA_SITE, JIRA_EMAIL, JIRA_TOKEN, JIRA_PROJECTS)", { status: 500 });
    }

    const cacheUrl = new URL(request.url);
    cacheUrl.searchParams.delete("force");
    const cacheKey = new Request(cacheUrl.toString(), request);
    const cache = caches.default;

    let response = bypassCache ? null : await cache.match(cacheKey);
    if (response) return response;

    const PROJECTS = RAW_PROJECTS.split(/[\s,]+/)
      .map(p => p.trim().toUpperCase())
      .filter(Boolean);

    const BASE_URL = `https://${SITE}/rest/api/3`;
    const auth = btoa(`${EMAIL}:${TOKEN}`);
    const headers = { Authorization: `Basic ${auth}`, Accept: "application/json" };

    const releases = [];

    const now = new Date().toISOString().slice(0, 19).replace('T', ' ');

    try {
      for (const key of PROJECTS) {
        let next = `${BASE_URL}/project/${key}/version?maxResults=100`;
        while (next) {
          const resp = await fetch(next, { headers });
          if (!resp.ok) {
            console.warn(`Failed to fetch versions for project ${key}: ${resp.status} ${resp.statusText}`);
            break;
          }
          const data = await resp.json();

          const versions = Array.isArray(data.values) ? data.values : [];
          for (const v of versions) {
            if (!v.released && !v.archived) {
              releases.push({
                project: key,
                version: v.name,
                versionId: v.id
              });
            }
          }
          next = data.nextPage || null;
        }
      }

      const grouped = releases.reduce((acc, r) => {
        if (!acc[r.project]) acc[r.project] = { versions: [] };
        acc[r.project].versions.push({ name: r.version, id: r.versionId });
        return acc;
      }, {});

      const result = {};
      for (const proj of PROJECTS) {
        result[proj] = grouped[proj] || { versions: [] };
      }

      const sortedProjects = Object.keys(result).sort();
      for (const p of sortedProjects) {
        result[p].versions.sort((a, b) => a.name.localeCompare(b.name));
      }

      const basePath = url.pathname;
      const host = url.host;
      const protocol = url.protocol;

      const htmlUrl = `${basePath}?format=html`;
      const mdUrl = `${basePath}?format=md`;
      const jsonUrl = `${basePath}?format=json`;

      const absoluteHtml = `${protocol}//${host}${htmlUrl}`;
      const absoluteMd = `${protocol}//${host}${mdUrl}`;
      const absoluteJson = `${protocol}//${host}${jsonUrl}`;

      const repoUrl = "https://github.com/crstauf/jira-active-releases";

      let body, contentType;

      if (format === "html") {
        let rows = "";
        for (const proj of sortedProjects) {
          const { versions } = result[proj];
          const projectUrl = `https://${SITE}/jira/software/c/projects/${proj}/summary`;
          const versionLinks = versions.length
            ? versions.map(v => `<a href="https://${SITE}/projects/${proj}/versions/${v.id}">${v.name}</a>`).join(", ")
            : `&mdash;`;

          rows += `<tr>
            <td style="padding-right: 2em; white-space: nowrap;">
              <a href="${projectUrl}" style="font-weight: 600; color: var(--link);">${proj}</a>
            </td>
            <td>${versionLinks}</td>
          </tr>`;
        }

        const forceUrl = `${basePath}?force=${Date.now()}`;

        body = `<!DOCTYPE html>
<html lang="en" data-theme="system">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="light dark">
  <title>My Active Jira Releases</title>

  <link rel="alternate" type="application/json" href="${jsonUrl}" title="JSON">
  <link rel="alternate" type="text/markdown; charset=utf-8" href="${mdUrl}" title="Markdown">

  <style>
    :root {
      --bg: #f6f8fa;
      --text: #172b4d;
      --table-bg: white;
      --border: #dfe1e6;
      --header-bg: #f1f5f9;
      --link: #0052cc;
      --muted: #6b778c;
      --surface-1: rgba(255,255,255,0.92);
    }

    [data-theme="dark"] {
      --bg: #101623;
      --text: #e6e9f0;
      --table-bg: #17212e;
      --border: #2b3d4f;
      --header-bg: #0f1a29;
      --link: #4c9aff;
      --muted: #9ca3af;
      --surface-1: rgba(23, 33, 46, 0.92);
    }

    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      margin: 40px;
      background: var(--bg);
      color: var(--text);
      line-height: 1.6;
      transition: background-color 0.3s, color 0.3s;
    }

    h1 { color: var(--link); border-bottom: 2px solid var(--link); padding-bottom: 10px; }
    table { width: 100%; border-collapse: collapse; margin-top: 20px; background: var(--table-bg); border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
    th, td { padding: 12px 0; text-align: left; }
    th { background: var(--header-bg); padding-left: 16px; padding-right: 16px; }
    td { padding-left: 16px; padding-right: 16px; border-top: 1px solid var(--border); vertical-align: top; }
    td:first-child { width: 1%; white-space: nowrap; }
    a { color: var(--link); text-decoration: none; }
    a:hover { text-decoration: underline; }

    .footer { margin-top: 60px; font-size: 0.9em; color: var(--muted); text-align: center; }
    .updated { margin-bottom: 2px; }
    .updated span { border-bottom: 1px dotted var(--muted); cursor: help; }
    .force { color: #de350b; font-weight: 600; font-size: 0.85em; margin-top: 2px; display: inline-block; }
    .formats { margin-top: 12px; }

    /* Theme Switcher */
    .theme-switcher {
      position: fixed;
      top: 1rem;
      right: 1rem;
      z-index: 100;
      background: var(--surface-1);
      backdrop-filter: blur(10px);
      -webkit-backdrop-filter: blur(10px);
      border-radius: 10px;
      padding: 0.4rem;
      box-shadow: 0 4px 16px rgba(0,0,0,0.15);
      display: flex;
      gap: 6px;
      border: 1px solid var(--border);
    }

    .theme-btn {
      background: none;
      border: none;
      width: 38px;
      height: 38px;
      border-radius: 8px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--muted);
      transition: all 0.2s;
    }

    .theme-btn:hover {
      background: rgba(0,0,0,0.08);
      color: var(--text);
    }

    [data-theme="dark"] .theme-btn:hover {
      background: rgba(255,255,255,0.12);
    }

    .theme-btn.active {
      background: var(--link);
      color: white;
    }

    .theme-btn svg {
      width: 22px;
      height: 22px;
    }

    /* GitHub icon in footer */
    .source a {
      color: var(--muted);
      text-decoration: none;
      display: inline-flex;
      align-items: center;
      gap: 8px;
      transition: color 0.3s;
    }

    .source a:hover {
      color: var(--text);
    }

    .source svg {
      width: 20px;
      height: 20px;
      fill: currentColor;
    }
  </style>
</head>
<body>

  <div class="theme-switcher">
    <button class="theme-btn" data-theme-value="light" title="Light">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="5"/>
        <line x1="12" y1="1" x2="12" y2="3"/>
        <line x1="12" y1="21" x2="12" y2="23"/>
        <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/>
        <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
        <line x1="1" y1="12" x2="3" y2="12"/>
        <line x1="21" y1="12" x2="23" y2="12"/>
        <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/>
        <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
      </svg>
    </button>

    <button class="theme-btn" data-theme-value="dark" title="Dark">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
      </svg>
    </button>

    <button class="theme-btn active" data-theme-value="system" title="System">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <rect x="3" y="4" width="18" height="16" rx="2" ry="2"/>
        <line x1="8" y1="20" x2="16" y2="20"/>
        <line x1="12" y1="16" x2="12" y2="20"/>
      </svg>
    </button>
  </div>

  <h1>My Active Jira Releases</h1>

  ${sortedProjects.length === 0
    ? `<p>No projects configured.</p>`
    : `<table>
        <thead><tr><th>Project</th><th>Unreleased Versions</th></tr></thead>
        <tbody>${rows}</tbody>
       </table>`
  }

  <div class="footer">
    <div class="updated" title="Cached for six hours">
      Updated: <span>${now} UTC</span>
    </div>
    <a href="${forceUrl}" class="force">Force Refresh</a>
    <div class="formats">
      View as: <a href="${mdUrl}">Markdown</a> • <a href="${jsonUrl}">JSON</a>
    </div>
    <div class="source">
      <a href="${repoUrl}">
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/>
        </svg>
        Source on GitHub
      </a>
    </div>
  </div>

  <script>
    const themeSwitcher = {
      current: localStorage.getItem('theme') || 'system',

      set(theme) {
        this.current = theme;
        localStorage.setItem('theme', theme);
        document.documentElement.setAttribute('data-theme', theme);

        document.querySelectorAll('.theme-btn').forEach(btn => {
          btn.classList.toggle('active', btn.dataset.themeValue === theme);
        });
      },

      init() {
        if (this.current === 'system') {
          const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
          document.documentElement.setAttribute('data-theme', prefersDark ? 'dark' : 'light');
        } else {
          document.documentElement.setAttribute('data-theme', this.current);
        }

        window.matchMedia('(prefers-color-scheme: dark)')
          .addEventListener('change', e => {
            if (this.current === 'system') {
              document.documentElement.setAttribute('data-theme', e.matches ? 'dark' : 'light');
            }
          });

        document.querySelectorAll('.theme-btn').forEach(btn => {
          btn.addEventListener('click', () => this.set(btn.dataset.themeValue));
        });
      }
    };

    document.addEventListener('DOMContentLoaded', () => themeSwitcher.init());
  </script>

</body>
</html>`;

        contentType = "text/html; charset=utf-8";

      } else if (format === "markdown") {
        let md = `# My Active Jira Releases

`;

        if (sortedProjects.length === 0) {
          md += "No projects configured.\n";
        } else {
          md += `| Project | Unreleased Versions |\n`;
          md += `| ------- | ------------------- |\n`;

          for (const proj of sortedProjects) {
            const { versions } = result[proj];
            const projectUrl = `https://${SITE}/jira/software/c/projects/${proj}/summary`;
            const versionText = versions.length
              ? versions.map(v => `[${v.name}](https://${SITE}/projects/${proj}/versions/${v.id})`).join(", ")
              : "—";

            md += `| [${proj}](${projectUrl}) | ${versionText} |\n`;
          }
        }

        md += `\n\n---\n\n`;
        md += `Generated by [jira-active-releases](${repoUrl})\n\n`;
        md += `Updated: ${now} UTC • `;
        md += `[View as HTML](${absoluteHtml}) • [View as Markdown](${absoluteMd}) • [View as JSON](${absoluteJson})`;

        body = md;
        contentType = "text/markdown; charset=utf-8";

      } else {
        const projectsData = sortedProjects.map(proj => {
          const { versions } = result[proj];
          return {
            project: proj,
            projectUrl: `https://${SITE}/jira/software/c/projects/${proj}/summary`,
            releases: versions.map(v => ({
              version: v.name,
              url: `https://${SITE}/projects/${proj}/versions/${v.id}`
            }))
          };
        });

        const jsonResponse = {
          _meta: {
            generated_at: `${now} UTC`,
            source: repoUrl,
            formats: {
              html: absoluteHtml,
              markdown: absoluteMd,
              json: absoluteJson
            }
          },
          projects: projectsData
        };

        return Response.json(jsonResponse);
      }

      const freshResponse = new Response(body, {
        headers: {
          "Content-Type": contentType,
          "Cache-Control": "public, max-age=21600, stale-while-revalidate=43200",
        },
      });

      ctx.waitUntil(cache.put(cacheKey, freshResponse.clone()));
      return freshResponse;

    } catch (e) {
      console.error("Worker error:", e);
      return new Response(`Error: ${e.message}\n\nStack: ${e.stack}`, { status: 500 });
    }
  },
};