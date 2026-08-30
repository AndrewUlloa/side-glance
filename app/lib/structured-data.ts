import {
  SIDE_GLANCE_CONTACT_EMAIL,
  SIDE_GLANCE_ORGANIZATION_NAME,
  SIDE_GLANCE_SITE_URL,
} from "./site-identity.ts";

const organizationId = `${SIDE_GLANCE_SITE_URL}/#organization`;
const websiteId = `${SIDE_GLANCE_SITE_URL}/#website`;
const softwareId = `${SIDE_GLANCE_SITE_URL}/#software`;

export const SIDE_GLANCE_STRUCTURED_DATA = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@id": organizationId,
      "@type": "Organization",
      address: {
        "@type": "PostalAddress",
        addressCountry: "US",
        addressLocality: "New York",
        addressRegion: "NY",
      },
      alternateName: "Design From",
      contactPoint: {
        "@type": "ContactPoint",
        email: SIDE_GLANCE_CONTACT_EMAIL,
        contactType: "technical support",
        url: "https://github.com/AndrewUlloa/side-glance/discussions",
      },
      email: SIDE_GLANCE_CONTACT_EMAIL,
      founder: {
        "@type": "Person",
        name: "Andrew Ulloa",
        url: "https://github.com/AndrewUlloa",
      },
      logo: {
        "@type": "ImageObject",
        url: `${SIDE_GLANCE_SITE_URL}/side-glance-mark.svg`,
      },
      legalName: SIDE_GLANCE_ORGANIZATION_NAME,
      name: SIDE_GLANCE_ORGANIZATION_NAME,
      sameAs: [
        "https://github.com/AndrewUlloa/side-glance",
        "https://www.npmjs.com/package/side-glance",
      ],
      url: SIDE_GLANCE_SITE_URL,
    },
    {
      "@id": websiteId,
      "@type": "WebSite",
      description: "Terminal and tmux lifecycle status for coding-agent CLIs.",
      inLanguage: "en",
      name: "Side Glance",
      publisher: { "@id": organizationId },
      url: SIDE_GLANCE_SITE_URL,
    },
    {
      "@id": softwareId,
      "@type": "SoftwareApplication",
      applicationCategory: "DeveloperApplication",
      author: { "@id": organizationId },
      brand: {
        "@type": "Brand",
        name: "Side Glance",
      },
      codeRepository: "https://github.com/AndrewUlloa/side-glance",
      copyrightHolder: { "@id": organizationId },
      creator: { "@id": organizationId },
      description:
        "Side Glance turns local coding-agent lifecycle events into terminal color and tmux markers. Its state protocol excludes prompts, responses, and transcripts.",
      downloadUrl: "https://www.npmjs.com/package/side-glance",
      isPartOf: { "@id": websiteId },
      license: "https://www.apache.org/licenses/LICENSE-2.0",
      name: "Side Glance",
      offers: {
        "@type": "Offer",
        availability: "https://schema.org/InStock",
        price: "0",
        priceCurrency: "USD",
        url: SIDE_GLANCE_SITE_URL,
      },
      operatingSystem: "macOS, Linux",
      softwareVersion: "0.1.0",
      url: SIDE_GLANCE_SITE_URL,
    },
  ],
} as const;

export const SIDE_GLANCE_STRUCTURED_DATA_JSON = JSON.stringify(
  SIDE_GLANCE_STRUCTURED_DATA
).replace(/</gu, "\\u003c");
