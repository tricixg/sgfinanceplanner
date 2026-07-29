import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      {
        source: "/past-spendings",
        destination: "/past-cashflow",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
