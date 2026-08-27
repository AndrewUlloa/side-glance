import Image from "next/image";

import type { SitePageContent } from "../lib/agent-content";
import { SiteFooter } from "./SiteFooter";

const navigation = [
  { href: "/", label: "Home" },
  { href: "/about", label: "About" },
  { href: "/contact", label: "Contact" },
  { href: "/privacy", label: "Privacy" },
] as const;

export function TrustPage({ page }: { page: SitePageContent }) {
  return (
    <div className="trust-page px-site-gutter">
      <header className="trust-header h-site-header">
        <a
          aria-label="Side Glance home"
          className="minimal-brand gap-brand-gap text-brand tracking-brand"
          href="/"
        >
          <Image
            alt=""
            aria-hidden="true"
            className="h-brand-mark-height w-brand-mark-width"
            height={24}
            priority
            src="/side-glance-mark.svg"
            width={35}
          />
          <span>Side Glance</span>
        </a>
        <nav aria-label="Primary" className="trust-navigation">
          {navigation.map((item) => (
            <a
              aria-current={page.path === item.href ? "page" : undefined}
              href={item.href}
              key={item.href}
            >
              {item.label}
            </a>
          ))}
        </nav>
      </header>

      <main className="trust-main">
        <div className="trust-introduction">
          <p className="trust-eyebrow">Side Glance</p>
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
