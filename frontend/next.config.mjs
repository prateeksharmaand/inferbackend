/** @type {import('next').NextConfig} */
const backend = process.env.INTERNAL_API_URL || "http://localhost:8000";
const nextConfig = {
  output: "standalone",
  poweredByHeader: false,
  // In production nginx routes /api to the backend directly; this rewrite serves local dev.
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${backend}/api/:path*` }];
  },
  async headers() {
    return [{
      source: "/:path*",
      headers: [
        { key: "X-Frame-Options", value: "DENY" },
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
      ],
    }];
  },
};
export default nextConfig;
