# Public site assets

Side Glance keeps the Next.js application on Vercel and serves substantial public
media from the `side-glance-assets-prod` Cloudflare R2 bucket. The production
origin is `https://assets.sideglance.ai`. Fonts, JavaScript, CSS, the favicon, and
sub-kilobyte interface SVGs remain with the Vercel application.

## Compression contract

Run raster source images through the `baoyu-compress-image` workflow before an
upload. Its default output is WebP at quality 80. Inspect the resulting images and
reject any conversion that is larger or visibly worse than its source. Keep the
Open Graph image as PNG for broad crawler compatibility when PNG compression does
not reduce its size.

Never overwrite an existing object key. The first 12 characters of the output's
SHA-256 digest belong in the key, and the complete digest, dimensions, MIME type,
and source filename belong in [`assets/r2-manifest.json`](../assets/r2-manifest.json).
Old objects stay available so an earlier Vercel deployment can roll back safely.

## Upload

Install and authenticate Wrangler, put the optimized files in one directory using
the manifest's `source` filenames, then run:

```bash
wrangler login
npm run assets:upload:r2 -- /absolute/path/to/optimized-assets
```

The uploader verifies every complete digest and immutable key before it invokes
Wrangler. Every object is uploaded with its declared content type and:

```text
Cache-Control: public, max-age=31536000, immutable
```

## Runtime configuration

The application defaults to `https://assets.sideglance.ai`. A temporary preview
origin can be selected at build time with:

```text
NEXT_PUBLIC_ASSET_ORIGIN=https://preview-asset-origin.example
```

Do not add an R2 SDK, bucket credential, or API token to the application. Browsers
only read public immutable URLs. The loading sequence uses unoptimized Next.js
images deliberately so R2 responses do not pass back through Vercel's
`/_next/image` endpoint.

Cloudflare Web Analytics is enabled only when this public token is present in the
Vercel build environment:

```text
NEXT_PUBLIC_CLOUDFLARE_WEB_ANALYTICS_TOKEN=<site-token>
```

## Domain cutover

After `sideglance.ai` is active in the same Cloudflare account as the bucket:

1. Connect `assets.sideglance.ai` to `side-glance-assets-prod` with minimum TLS 1.2.
2. Verify every manifest URL and its `Cache-Control` and `Content-Type` headers.
3. Warm an asset twice and confirm a Cloudflare cache hit on the custom domain.
4. Disable the temporary `r2.dev` public URL.

The apex and `www` records remain DNS-only records pointing to Vercel. Do not put
Cloudflare's HTTP reverse proxy in front of the Next.js application.
