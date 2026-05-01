import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Permitir acceso desde red local (móvil testing)
  allowedDevOrigins: [
    "192.168.1.70",
    "192.168.*.*",
    "localhost",
  ],
  
  // Forzar workspace root al directorio del proyecto
  // Esto evita que Next.js use lockfiles huérfanos en niveles superiores
  turbopack: {
    root: __dirname,
  },
  
  // Excluir dependencias nativas de Remotion del bundle del servidor
  // para evitar errores de build en Vercel
  serverExternalPackages: [
    "@remotion/bundler",
    "@remotion/renderer",
    "@remotion/compositor-darwin-x64",
    "@remotion/compositor-darwin-arm64",
    "@remotion/compositor-linux-x64-gnu",
    "@remotion/compositor-linux-arm64-gnu",
    "@remotion/compositor-linux-x64-musl",
    "@remotion/compositor-linux-arm64-musl",
    "@remotion/compositor-win32-x64-msvc",
    "remotion"
  ],
  
  // Ignorar errores de TypeScript en build de producción
  // (VS Code sigue marcando errores en desarrollo)
  typescript: {
    ignoreBuildErrors: true,
  },
  
  // Ignorar errores de ESLint en build de producción
  eslint: {
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
