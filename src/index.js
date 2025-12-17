export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    let format = url.searchParams.get("format") || "html";
    // Normalize: accept both "markdown" and "md"
    if (format === "md") format = "markdown";

    const bypassCache = url.searchParams.has("force");

    const SITE = env.JIRA_SITE;
    const EMAIL = env.JIRA_EMAIL;
    const TOKEN = env.JIRA_TOKEN;
    const RAW_PROJECTS = env.JIRA_PROJECTS || "";

    if (!SITE || !EMAIL || !TOKEN || !RAW_PROJECTS) {
      return new Response("Missing required environment variables (JIRA_SITE, JIRA_EMAIL, JIRA_TOKEN, JIRA_PROJECTS)", { status: 500 });
    }

    // Cache key ignores ?force
    const cacheUrl = new URL(request.url);
    cacheUrl.searchParams.delete("force");
    const cacheKey = new Request(cacheUrl.toString(), request);
    const cache = caches.default;

    let response = bypassCache ? null : await cache.match(cacheKey);
    if (response) return response;

    // ——— Fresh fetch ———
    const PROJECTS = RAW_PROJECTS.split(/[\s,]+/)
      .map(p => p.trim().toUpperCase())
      .filter(Boolean);

    const BASE_URL = `https://${SITE}/rest/api/3`;
    const auth = btoa(`${EMAIL}:${TOKEN}`);
    const headers = { Authorization: `Basic ${auth}`, Accept: "application/json" };

    const releases = [];

    const now = new Date().toISOString().slice(0, 19).replace('T', ' '); // For HTML only

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

      // Group releases by project
      const grouped = releases.reduce((acc, r) => {
        if (!acc[r.project]) {
          acc[r.project] = { versions: [] };
        }
        acc[r.project].versions.push({ name: r.version, id: r.versionId });
        return acc;
      }, {});

      // Ensure EVERY project appears, even with zero releases
      const result = {};
      for (const proj of PROJECTS) {
        result[proj] = grouped[proj] || { versions: [] };
      }

      // Sort projects and versions
      const sortedProjects = Object.keys(result).sort();
      for (const p of sortedProjects) {
        result[p].versions.sort((a, b) => a.name.localeCompare(b.name));
      }

      // Build response
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

        const forceUrl = `${url.pathname}?force=1${format !== "html" ? `&format=${format}` : ""}`;

        body = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>My Active Jira Releases</title>
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
    .updated { margin-bottom: 8px; font-size: 0.85em; }
    .cache { margin-top: 8px; font-size: 0.85em; }
    .force { color: #de350b; font-weight: 600; }
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
    <p>Generated by your personal Jira Releases Worker</p>
    <div class="updated">
      Updated: ${now} UTC
    </div>
    <div class="cache">
      Cached for six hours • <a href="${forceUrl}" class="force">Force Refresh</a>
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

        // No footer metadata in Markdown
        body = md;
        contentType = "text/markdown; charset=utf-8";

      } else {
        // JSON: grouped by project, all projects included
        const jsonData = sortedProjects.map(proj => {
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

        return Response.json(jsonData);
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