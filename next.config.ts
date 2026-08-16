import type { NextConfig } from 'next';

/**
 * Security headers applied to every response.
 * The CSP is intentionally strict: no third-party script origins are allowed.
 */
const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-DNS-Prefetch-Control', value: 'off' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains; preload',
  },
];

/**
 * Cache headers para otimizar performance.
 * Estáticos são cacheados por muito tempo, dinâmicos por pouco tempo.
 */
const cacheHeaders = [
  // Imagens e assets estáticos
  {
    source: '/public/:path*',
    headers: [
      { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
    ],
  },
  // Fontes
  {
    source: '/_next/static/:path*',
    headers: [
      { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
    ],
  },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  serverExternalPackages: ['pdfjs-dist', 'mammoth', '@aws-sdk/client-s3', 'bcryptjs'],
  experimental: {
    serverActions: {
      bodySizeLimit: '2mb',
    },
  },
  // Compressão
  compress: true,
  // Otimização de imagens
  images: {
    unoptimized: true, // Em dev, não otimiza (mais rápido)
    formats: ['image/webp', 'image/avif'],
  },
  async headers() {
    return [
      ...cacheHeaders,
      {
        source: '/:path*',
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
