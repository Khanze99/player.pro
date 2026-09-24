import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Соседний lockfile в корне монорепо (../package-lock.json) иначе путает
  // авто-определение workspace root для Turbopack.
  turbopack: {
    root: path.join(__dirname),
  },
  // Минимальный самодостаточный сервер для Docker (infra/docker-compose.stand.yml,
  // web/Dockerfile) — .next/standalone/server.js вместо полного node_modules в образе.
  output: "standalone",
};

export default nextConfig;
