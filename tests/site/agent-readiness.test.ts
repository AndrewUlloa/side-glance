import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path: string) => readFile(path, "utf8");

const readOptional = async (path: string) => {
  try {
    return await read(path);
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return "";
    }
    throw error;
  }
};

test("serves honest, recoverable HTML and Markdown not-found responses", async () => {
  const [notFound, markdownRoute, agentContent] = await Promise.all([
    readOptional("app/not-found.tsx"),
    readOptional("app/api/markdown/[[...slug]]/route.ts"),
    readOptional("app/lib/agent-content.ts"),
  ]);

  assert.ok(notFound.length > 0, "missing App Router not-found boundary");
  assert.match(notFound, /Page not found/u);
  assert.match(notFound, /href="\/sitemap\.xml"/u);
  assert.match(notFound, /href="\/llms\.txt"/u);
  assert.match(markdownRoute, /status:\s*404/u);
  assert.match(markdownRoute, /text\/markdown; charset=utf-8/u);
  assert.match(agentContent, /# 404 — Page not found/u);
  assert.match(agentContent, /https:\/\/sideglance\.dev\/sitemap\.xml/u);
  assert.match(agentContent, /https:\/\/sideglance\.dev\/llms\.txt/u);
});

test("negotiates Markdown with RFC-style preference handling and cache-safe headers", async () => {
  const [proxySource, negotiationSource, vercelConfigSource] =
    await Promise.all([
      readOptional("proxy.ts"),
      readOptional("app/lib/content-negotiation.ts"),
      read("vercel.json"),
    ]);

  assert.ok(proxySource.length > 0, "missing Next.js 16 proxy");
  assert.ok(negotiationSource.length > 0, "missing Accept negotiation helper");

  const { appendVary, preferredRepresentation } = await import(
    "../../app/lib/content-negotiation.ts"
  );

  assert.equal(preferredRepresentation(null), "text/html");
  assert.equal(preferredRepresentation("*/*"), "text/html");
  assert.equal(preferredRepresentation("text/markdown"), "text/markdown");
  assert.equal(
    preferredRepresentation("text/markdown, text/html;q=0.8"),
    "text/markdown"
  );
  assert.equal(
    preferredRepresentation("text/html;q=1, text/markdown;q=0.2"),
    "text/html"
  );
  assert.equal(
    preferredRepresentation("text/html;q=0, */*;q=1"),
    "text/markdown"
  );
  assert.equal(preferredRepresentation("application/pdf"), null);
  assert.equal(
    appendVary("Accept-Encoding", "Accept"),
    "Accept-Encoding, Accept"
  );
  assert.equal(
    appendVary("accept, Accept-Encoding", "Accept"),
    "accept, Accept-Encoding"
  );
  assert.match(proxySource, /status:\s*406/u);
  assert.match(proxySource, /Vary/u);

  const vercelConfig = JSON.parse(vercelConfigSource) as {
    routes?: Array<{
      continue?: boolean;
      src?: string;
      transforms?: Array<{
        args?: string | string[];
        op?: string;
        target?: { key?: string };
        type?: string;
      }>;
    }>;
  };
  const representationRoute = vercelConfig.routes?.find(
    ({ src }) => src === "/(.*)"
  );
  assert.equal(
    representationRoute?.continue,
    true,
    "Vercel representation transform must continue to the Next.js route"
  );
  const varyTransform = representationRoute?.transforms?.find(
    ({ op, target, type }) =>
      type === "response.headers" &&
      op === "append" &&
      target?.key?.toLowerCase() === "vary"
  );
  assert.ok(varyTransform, "missing post-response Vary transform");
  assert.deepEqual(varyTransform.args, ["Accept", "Accept-Encoding"]);
});

test("canonicalizes Markdown representations to their HTML pages", async () => {
  const { GET } = await import("../../app/api/markdown/[[...slug]]/route.ts");
  const response = await GET(new Request("https://sideglance.dev/about.md"), {
    params: Promise.resolve({ slug: ["about"] }),
  });

  assert.equal(response.status, 200);
  assert.equal(
    response.headers.get("link"),
    '<https://sideglance.dev/about>; rel="canonical", <https://sideglance.dev/about.md>; rel="alternate"; type="text/markdown", <https://sideglance.dev/llms.txt>; rel="describedby"'
  );
});

test("server-rendered homepage contains a useful heading hierarchy and substantial copy", async () => {
  const [page, overview, agentContent] = await Promise.all([
    read("app/page.tsx"),
    read("app/components/AgentOverview.tsx"),
    readOptional("app/lib/agent-content.ts"),
  ]);
  const homepageSource = `${page}\n${overview}`;

  assert.match(homepageSource, /<h1>/u);
  assert.match(homepageSource, /<h2/u);
  assert.match(homepageSource, /HOME_PAGE_CONTENT\.sections\[1\]\.heading/u);
  assert.match(homepageSource, /HOME_PAGE_CONTENT\.sections\[2\]\.heading/u);
  assert.match(agentContent, /What Side Glance does/u);
  assert.match(agentContent, /Agent sessions\. One clear glance\./u);
  assert.match(agentContent, /How it works/u);
  assert.doesNotMatch(homepageSource, /Local-first agent attention/u);
  assert.ok(agentContent.length > 2500, "agent-readable content is too thin");
});

test("publishes page-specific social metadata for each trust page", async () => {
  const pageSources = await Promise.all(
    [
      ["app/about/page.tsx", "/about"],
      ["app/contact/page.tsx", "/contact"],
      ["app/privacy/page.tsx", "/privacy"],
    ].map(([path, canonical]) =>
      read(path).then((source) => ({ canonical, source }))
    )
  );

  for (const { canonical, source } of pageSources) {
    assert.match(source, /buildPageMetadata/u);
    assert.ok(source.includes(`canonical: "${canonical}"`));
  }

  const helper = await read("app/lib/page-metadata.ts");
  assert.match(helper, /openGraph/u);
  assert.match(helper, /twitter/u);
  assert.match(helper, /SITE_ASSETS\.openGraph/u);
});

test("publishes canonical identity and accurate JSON-LD", async () => {
  const [siteIdentity, layout, structuredData] = await Promise.all([
    read("app/lib/site-identity.ts"),
    read("app/layout.tsx"),
    readOptional("app/lib/structured-data.ts"),
  ]);

  assert.match(
    siteIdentity,
    /SIDE_GLANCE_SITE_URL = "https:\/\/sideglance\.dev"/u
  );
  assert.match(layout, /application\/ld\+json/u);
  assert.match(structuredData, /"@type":\s*"SoftwareApplication"/u);
  assert.match(structuredData, /"@type":\s*"Organization"/u);
  assert.match(structuredData, /"@type":\s*"WebSite"/u);
  assert.match(structuredData, /contactPoint/u);
  assert.match(structuredData, /"@type":\s*"PostalAddress"/u);
  assert.match(structuredData, /addressLocality:\s*"New York"/u);
  assert.match(
    structuredData,
    /https:\/\/github\.com\/AndrewUlloa\/side-glance\/discussions/u
  );
  assert.doesNotMatch(structuredData, /example\.com|TODO|TBD/u);

  const { SIDE_GLANCE_STRUCTURED_DATA } = await import(
    "../../app/lib/structured-data.ts"
  );
  const [organization] = SIDE_GLANCE_STRUCTURED_DATA["@graph"];
  assert.equal(organization.name, "Design From, Inc.");
  assert.equal(organization.legalName, "Design From, Inc.");
  assert.equal(organization.email, "andrew@designfrom.com");
  assert.deepEqual(organization.address, {
    "@type": "PostalAddress",
    addressCountry: "US",
    addressLocality: "New York",
    addressRegion: "NY",
  });
  assert.equal(organization.contactPoint.email, "andrew@designfrom.com");
  const [, , software] = SIDE_GLANCE_STRUCTURED_DATA["@graph"];
  assert.deepEqual(software.offers, {
    "@type": "Offer",
    availability: "https://schema.org/InStock",
    price: "0",
    priceCurrency: "USD",
    url: "https://sideglance.dev",
  });
});

test("credits Design From in public project metadata", async () => {
  const [packageSource, readme] = await Promise.all([
    read("packages/cli/package.json"),
    read("README.md"),
  ]);
  const packageMetadata = JSON.parse(packageSource) as {
    author?: { email?: string; name?: string; url?: string };
  };

  assert.deepEqual(packageMetadata.author, {
    name: "Design From, Inc.",
    email: "andrew@designfrom.com",
    url: "https://sideglance.dev",
  });
  assert.match(readme, /Side Glance originated at Design From, Inc\./u);
});

test("publishes a spec-shaped llms.txt with concrete when-to-use guidance", async () => {
  const llms = await readOptional("public/llms.txt");

  assert.match(llms, /^# Side Glance\n\n> /u);
  assert.match(llms, /^## When to use Side Glance$/mu);
  assert.match(llms, /Use Side Glance when/u);
  assert.match(llms, /https:\/\/sideglance\.dev\/index\.md/u);
  assert.match(llms, /https:\/\/sideglance\.dev\/about\.md/u);
  assert.match(
    llms,
    /https:\/\/sideglance\.dev\/\.well-known\/agent-skills\/index\.json/u
  );
  assert.match(
    llms,
    /https:\/\/sideglance\.dev\/\.well-known\/ai-catalog\.json/u
  );
  assert.match(llms, /^## Optional$/mu);
  assert.doesNotMatch(llms, /example\.com|TODO|TBD/u);
});

test("publishes a valid sitemap and explicit agent content policy", async () => {
  const [sitemapSource, robotsSource] = await Promise.all([
    readOptional("app/sitemap.ts"),
    readOptional("public/robots.txt"),
  ]);

  assert.ok(sitemapSource.length > 0, "missing sitemap metadata route");
  assert.ok(robotsSource.length > 0, "missing robots metadata route");

  const { default: sitemap } = await import("../../app/sitemap.ts");
  const urls = sitemap().map((entry) => entry.url);

  assert.deepEqual(urls, [
    "https://sideglance.dev",
    "https://sideglance.dev/about",
    "https://sideglance.dev/contact",
    "https://sideglance.dev/privacy",
  ]);
  assert.ok(sitemap().every((entry) => entry.lastModified === undefined));
  assert.match(robotsSource, /^User-agent: \*$/mu);
  assert.match(robotsSource, /^Allow: \/$/mu);
  assert.match(
    robotsSource,
    /^Content-Signal: ai-train=no, search=yes, ai-input=yes$/mu
  );
  assert.match(
    robotsSource,
    /^Sitemap: https:\/\/sideglance\.dev\/sitemap\.xml$/mu
  );
  assert.match(
    robotsSource,
    /^Agentmap: https:\/\/sideglance\.dev\/\.well-known\/ai-catalog\.json$/mu
  );
});

test("adds substantive About, Contact, and Privacy trust pages", async () => {
  const [about, contact, privacy, agentContent] = await Promise.all([
    readOptional("app/about/page.tsx"),
    readOptional("app/contact/page.tsx"),
    readOptional("app/privacy/page.tsx"),
    readOptional("app/lib/agent-content.ts"),
  ]);

  assert.match(about, /TrustPage/u);
  assert.match(contact, /TrustPage/u);
  assert.match(privacy, /TrustPage/u);
  assert.match(agentContent, /About Side Glance/u);
  assert.match(agentContent, /Contact and support/u);
  assert.match(agentContent, /Privacy/u);
  assert.match(agentContent, /Cloudflare Web Analytics/u);
  assert.match(agentContent, /private vulnerability report/u);
  assert.match(agentContent, /Why Side Glance exists/u);
  assert.match(
    agentContent,
    /have become the watcher of their own automation/u
  );
  assert.doesNotMatch(
    agentContent,
    /Why I built Side Glance|I built Side Glance/u
  );
  assert.match(agentContent, /The design influence/u);
  assert.match(agentContent, /Shisa Kanko/u);
  assert.match(agentContent, /shisha-kanko-pointing-calling-redux/u);
  assert.doesNotMatch(agentContent, /once discussions are enabled/u);
  assert.ok(agentContent.length > 2500, "trust-page content is too thin");
});

test("publishes a digest-verified Side Glance skill discovery index", async () => {
  const [indexSource, skillSource] = await Promise.all([
    readOptional("app/.well-known/agent-skills/index.json/route.ts"),
    readOptional("app/.well-known/agent-skills/side-glance/SKILL.md/route.ts"),
  ]);
  assert.ok(indexSource.length > 0, "missing agent-skills discovery index");
  assert.ok(skillSource.length > 0, "missing Side Glance skill artifact");

  const [{ GET: getIndex }, { GET: getSkill }] = await Promise.all([
    import("../../app/.well-known/agent-skills/index.json/route.ts"),
    import("../../app/.well-known/agent-skills/side-glance/SKILL.md/route.ts"),
  ]);

  const [indexResponse, skillResponse] = await Promise.all([
    getIndex(),
    getSkill(),
  ]);
  const index = (await indexResponse.json()) as {
    $schema: string;
    skills: Array<{
      description: string;
      digest: string;
      name: string;
      type: string;
      url: string;
    }>;
  };
  const skill = await skillResponse.text();
  const digest = `sha256:${createHash("sha256").update(skill).digest("hex")}`;

  assert.equal(indexResponse.status, 200);
  assert.match(
    indexResponse.headers.get("content-type") ?? "",
    /application\/json/u
  );
  assert.equal(
    index.$schema,
    "https://schemas.agentskills.io/discovery/0.2.0/schema.json"
  );
  assert.deepEqual(index.skills, [
    {
      name: "side-glance",
      type: "skill-md",
      description:
        "Install, configure, and verify Side Glance terminal and tmux status for local coding-agent CLIs.",
      url: "https://sideglance.dev/.well-known/agent-skills/side-glance/SKILL.md",
      digest,
    },
  ]);
  assert.match(
    skillResponse.headers.get("content-type") ?? "",
    /text\/markdown/u
  );
  assert.match(skill, /^---\nname: side-glance\n/mu);
  assert.match(skill, /^## When to use Side Glance$/mu);
  assert.match(skill, /npx side-glance@latest init/u);
  assert.match(skill, /state protocol and saved state exclude prompts/u);
});

test("publishes truthful ARD and RFC 9727 discovery documents", async () => {
  const [ardSource, catalogSource, openApiSource, proxySource] =
    await Promise.all([
      readOptional("app/.well-known/ai-catalog.json/route.ts"),
      readOptional("app/.well-known/api-catalog/route.ts"),
      readOptional("app/openapi.json/route.ts"),
      read("proxy.ts"),
    ]);
  assert.ok(ardSource.length > 0, "missing ARD capability manifest");
  assert.ok(catalogSource.length > 0, "missing RFC 9727 API catalog");
  assert.ok(openApiSource.length > 0, "missing OpenAPI service description");
  assert.match(proxySource, /pathname\.startsWith\("\/\.well-known\/"\)/u);
  assert.match(proxySource, /pathname === "\/auth\.md"/u);

  const [{ GET: getArd }, { GET: getApiCatalog }, { GET: getOpenApi }] =
    await Promise.all([
      import("../../app/.well-known/ai-catalog.json/route.ts"),
      import("../../app/.well-known/api-catalog/route.ts"),
      import("../../app/openapi.json/route.ts"),
    ]);

  const [ardResponse, catalogResponse, openApiResponse] = await Promise.all([
    getArd(),
    getApiCatalog(),
    getOpenApi(),
  ]);
  const ard = (await ardResponse.json()) as {
    entries: Record<string, unknown>[];
    host: { displayName: string; identifier: string };
    specVersion: string;
  };
  const catalog = (await catalogResponse.json()) as {
    linkset: Record<string, unknown>[];
  };
  const openApi = (await openApiResponse.json()) as {
    info: { title: string };
    openapi: string;
    paths: Record<string, unknown>;
  };

  assert.equal(ardResponse.status, 200);
  assert.match(
    ardResponse.headers.get("content-type") ?? "",
    /application\/json/u
  );
  assert.equal(ardResponse.headers.get("access-control-allow-origin"), "*");
  assert.equal(ard.specVersion, "1.0");
  assert.deepEqual(ard.host, {
    displayName: "Design From, Inc.",
    identifier: "did:web:sideglance.dev",
  });
  assert.ok(ard.entries.length > 0);
  for (const entry of ard.entries) {
    assert.match(String(entry.identifier), /^urn:air:sideglance\.dev:/u);
    assert.ok(Boolean(entry.url) !== Boolean(entry.data));
    assert.ok(
      Array.isArray(entry.representativeQueries) &&
        entry.representativeQueries.length >= 2 &&
        entry.representativeQueries.length <= 5
    );
  }

  assert.equal(catalogResponse.status, 200);
  assert.match(
    catalogResponse.headers.get("content-type") ?? "",
    /application\/linkset\+json/u
  );
  assert.ok(catalog.linkset.length > 0);
  const relations = catalog.linkset.flatMap((entry) =>
    Object.keys(entry).filter((key) => key !== "anchor")
  );
  assert.ok(relations.includes("service-desc"));
  assert.ok(relations.includes("service-doc"));
  assert.ok(relations.includes("status"));

  assert.equal(openApi.openapi, "3.1.0");
  assert.equal(openApi.info.title, "Side Glance Agent Discovery API");
  assert.ok(openApi.paths["/.well-known/agent-skills/index.json"]);
  assert.ok(openApi.paths["/.well-known/ai-catalog.json"]);
  assert.ok(openApi.paths["/api/status"]);
});

test("documents its no-auth public surface without inventing OAuth or MCP", async () => {
  const [authSource, statusSource] = await Promise.all([
    readOptional("app/auth.md/route.ts"),
    readOptional("app/api/status/route.ts"),
  ]);
  assert.ok(authSource.length > 0, "missing truthful auth.md guidance");
  assert.ok(statusSource.length > 0, "missing discovery health endpoint");

  const [{ GET: getAuth }, { GET: getStatus }] = await Promise.all([
    import("../../app/auth.md/route.ts"),
    import("../../app/api/status/route.ts"),
  ]);
  const [authResponse, statusResponse] = await Promise.all([
    getAuth(),
    getStatus(),
  ]);
  const auth = await authResponse.text();
  const status = (await statusResponse.json()) as Record<string, unknown>;

  assert.match(
    authResponse.headers.get("content-type") ?? "",
    /text\/markdown/u
  );
  assert.match(auth, /^# Side Glance auth\.md$/mu);
  assert.match(auth, /No registration or credentials are required/u);
  assert.deepEqual(status, {
    service: "side-glance-agent-discovery",
    status: "ok",
    authentication: "none",
  });
  assert.equal(
    await readOptional("app/.well-known/oauth-authorization-server/route.ts"),
    ""
  );
  assert.equal(
    await readOptional("app/.well-known/oauth-protected-resource/route.ts"),
    ""
  );
  assert.equal(
    await readOptional("app/.well-known/mcp/server-card.json/route.ts"),
    ""
  );
});

test("registers useful read-only WebMCP tools when the browser API exists", async () => {
  const [component, layout] = await Promise.all([
    readOptional("app/components/WebMcpTools.tsx"),
    read("app/layout.tsx"),
  ]);

  assert.match(component, /document\.modelContext/u);
  assert.match(component, /registerTool/u);
  assert.match(component, /navigator\.modelContext/u);
  assert.match(component, /provideContext/u);
  assert.match(component, /get-side-glance-install-command/u);
  assert.match(component, /get-side-glance-project-info/u);
  assert.match(component, /new AbortController/u);
  assert.match(component, /signal:\s*controller\.signal/u);
  assert.match(layout, /<WebMcpTools\s*\/>/u);
  assert.match(layout, /href="\/\.well-known\/ai-catalog\.json"/u);
  assert.match(layout, /rel="ai-catalog"/u);
});
