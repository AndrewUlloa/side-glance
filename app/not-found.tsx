import { SiteFooter } from "./components/SiteFooter";

export default function NotFound() {
  return (
    <div className="trust-page not-found-page px-site-gutter">
      <main className="not-found-main">
        <p className="trust-eyebrow">404</p>
        <h1>Page not found</h1>
        <p>
          Side Glance does not have a page at this path. Use one of the
          machine-readable indexes below to recover without guessing.
        </p>
        <nav aria-label="404 recovery">
          <a href="/">Homepage</a>
          <a href="/sitemap.xml">Sitemap</a>
          <a href="/llms.txt">Agent instructions</a>
          <a href="https://github.com/AndrewUlloa/side-glance">
            Documentation on GitHub
          </a>
        </nav>
      </main>
      <SiteFooter />
    </div>
  );
}
