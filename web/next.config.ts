import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // @interimatch/core est publié en TypeScript source, sans étape de build :
  // Next doit le transpiler comme le reste de l'application.
  transpilePackages: ["@interimatch/core"],

  // RGESN — réduction du poids transféré.
  compress: true,
  images: { formats: ["image/avif", "image/webp"] },

  // Le pilote PostgreSQL ne doit pas être embarqué dans le bundle client.
  serverExternalPackages: ["postgres"],
};

export default nextConfig;
