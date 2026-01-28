import type { NextConfig } from "next";

// サーバーサイドのタイムゾーンを日本時間に設定
process.env.TZ = 'Asia/Tokyo';

const nextConfig: NextConfig = {
  /* config options here */
  env: {
    TZ: 'Asia/Tokyo',
  },
};

export default nextConfig;
