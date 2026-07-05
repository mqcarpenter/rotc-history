import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // This host has no Node.js runtime available, so the app is built as
  // plain static HTML/CSS/JS ("next export"-style output) and uploaded as
  // files — no server process required at all. Rebuild + re-upload the
  // `out/` folder whenever you re-import data.
  output: "export",
  // Emit /some/page/index.html instead of /some/page.html, so a plain
  // Apache-based shared host serves it at /some/page/ with zero server
  // config (relying on `.html` extension resolution instead needs
  // mod_negotiation/MultiViews, which isn't guaranteed to be on).
  trailingSlash: true,
  // sql.js reads its .wasm file from disk (fs) during the build, so it must
  // not be bundled by webpack/turbopack — same pattern used for native
  // modules like better-sqlite3 in Next.js apps.
  serverExternalPackages: ["sql.js"],
};

export default nextConfig;
