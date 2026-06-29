/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {},
  images: { remotePatterns: [] },
  async rewrites() {
    const apiDest =
      process.env.INTERNAL_API_URL ||
      process.env.NEXT_PUBLIC_API_URL ||
      "http://localhost:3001";
    return [
      {
        source: "/api/health",
        destination: `${apiDest}/health`,
      },
      {
        source: "/api/:path*",
        destination: `${apiDest}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
