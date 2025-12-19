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

      // Links — explicit format params, absolute where needed
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
              <a href="${projectUrl}" style="font-weight: 600; color: #0052cc;">${proj}</a>
            </td>
            <td>${versionLinks}</td>
          </tr>`;
        }

        const forceUrl = `${basePath}?force=1`;

        body = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>My Active Jira Releases</title>

  <link rel="alternate" type="application/json" href="${jsonUrl}" title="JSON">
  <link rel="alternate" type="text/markdown; charset=utf-8" href="${mdUrl}" title="Markdown">

  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; margin: 40px; background: #f6f8fa; color: #172b4d; line-height: 1.6; }
    h1 { color: #0052cc; border-bottom: 2px solid #0052cc; padding-bottom: 10px; }
    table { width: 100%; border-collapse: collapse; margin-top: 20px; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
    th, td { padding: 12px 0; text-align: left; }
    th { background: #f1f5f9; padding-left: 16px; padding-right: 16px; }
    td { padding-left: 16px; padding-right: 16px; border-top: 1px solid #dfe1e6; vertical-align: top; }
    td:first-child { width: 1%; white-space: nowrap; }
    a { color: #0052cc; text-decoration: none; }
    a:hover { text-decoration: underline; }
    .footer { margin-top: 60px; font-size: 0.9em; color: #6b778c; text-align: center; }
    .updated { margin-bottom: 2px; font-size: 0.85em; }
    .updated span { border-bottom: 1px dotted #6b778c; cursor: help; }
    .force { color: #de350b; font-weight: 600; font-size: 0.85em; margin-top: 2px; display: inline-block; }
    .formats { margin-top: 12px; font-size: 0.85em; }
    .source { margin-top: 16px; }
    .source a { color: #9ca3af; display: inline-flex; align-items: center; gap: 6px; }
    .source svg { height: 16px; width: 16px; }
    .source .visually-hidden { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap; border: 0; }
  </style>
</head>
<body>
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
        <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
          <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"></path>
        </svg>
        <span class="visually-hidden">Source on GitHub</span>
      </a>
    </div>
  </div>
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