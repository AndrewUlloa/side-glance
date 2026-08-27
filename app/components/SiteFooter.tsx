const footerLinks = [
  { href: "/about", label: "About" },
  { href: "/contact", label: "Contact" },
  { href: "/privacy", label: "Privacy" },
  { href: "/sitemap.xml", label: "Sitemap" },
  { href: "/llms.txt", label: "For agents" },
] as const;

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <p>
        Side Glance · Local-first attention for coding-agent CLIs · Originated
        by Design From, Inc.
      </p>
      <nav aria-label="Footer">
        {footerLinks.map((link) => (
          <a href={link.href} key={link.href}>
            {link.label}
          </a>
        ))}
      </nav>
    </footer>
  );
}
