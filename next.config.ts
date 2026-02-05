import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Permitir acceso desde red local (móvil testing)
  allowedDevOrigins: [
    "192.168.1.70",
    "192.168.*.*",
    "localhost",
  ],
};

export default nextConfig;
