import type { SitePageContent } from "../lib/agent-content";
import { SiteFooter } from "./SiteFooter";

export function TrustPage({ page }: { page: SitePageContent }) {
  return (
    <div className="trust-page px-site-gutter">
      <main className="trust-main">
        <div className="trust-introduction">
          <h1>{page.title}</h1>
          <p className="trust-description">{page.description}</p>
        </div>

        <div className="trust-sections">
          {page.sections.map((section) => (
            <section key={section.heading}>
              <h2>{section.heading}</h2>
              {section.paragraphs.map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
            </section>
          ))}
        </div>

        <section className="trust-resources">
          <h2>Related resources</h2>
          <ul>
            {page.links.map((link) => (
              <li key={link.href}>
                <a href={link.href}>{link.label}</a>
                <span>{link.description}</span>
              </li>
            ))}
          </ul>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
