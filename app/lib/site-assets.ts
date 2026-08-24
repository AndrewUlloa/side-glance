import manifest from "../../assets/r2-manifest.json";

export const SIDE_GLANCE_SITE_URL = "https://side-glance.vercel.app";

const configuredAssetOrigin =
  process.env.NEXT_PUBLIC_ASSET_ORIGIN ?? manifest.defaultOrigin;

export const SIDE_GLANCE_ASSET_ORIGIN = new URL(configuredAssetOrigin).origin;

const assetUrl = (key: string) =>
  new URL(key, `${SIDE_GLANCE_ASSET_ORIGIN}/`).toString();

export const SITE_ASSETS = {
  heroSurface: assetUrl(manifest.assets.heroSurface.key),
  loadingLife: [
    assetUrl(manifest.assets.loadingLife01.key),
    assetUrl(manifest.assets.loadingLife02.key),
    assetUrl(manifest.assets.loadingLife03.key),
    assetUrl(manifest.assets.loadingLife04.key),
  ],
  openGraph: assetUrl(manifest.assets.openGraph.key),
} as const;
