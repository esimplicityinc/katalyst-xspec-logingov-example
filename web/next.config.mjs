// The browser only talks to this origin (localhost:3000). /v1/* is passed to
// the BFF (bff/server.mjs on :8000), so its login routes and its __Host-ses
// session cookie live on the frontend's origin, like a typical deployment
// behind one domain.
const BFF_URL = process.env.BFF_URL || 'http://localhost:8000';

/** @type {import('next').NextConfig} */
export default {
  trailingSlash: true,
  async rewrites() {
    return [{ source: '/v1/:path*', destination: `${BFF_URL}/v1/:path*` }];
  },
};
