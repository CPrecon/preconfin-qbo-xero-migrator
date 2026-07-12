import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

const nextConfig = {
  transpilePackages: ["@preconfin/shared-ui"],
  turbopack: {
    root: resolve(__dirname, "../.."),
  },
  experimental: {
    optimizePackageImports: ["lucide-react"],
  },
};

export default nextConfig;
