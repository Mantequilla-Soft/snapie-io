/** @type {import('next').NextConfig} */
const nextConfig = {
    experimental: {
        // Loads instrumentation.ts. Framework-script deferral runs only when
        // SNAPIE_DEFER_FRAMEWORK_SCRIPTS=1. See lib/perf/deferFrameworkScripts.js.
        instrumentationHook: true,
        serverActions: {
            bodySizeLimit: '10mb', // Increase the body size limit
        },
    },
    images: {
        // AVIF when the browser asks for it, WebP otherwise. Sharp (a
        // production dependency) does the encode inside /_next/image.
        formats: ['image/avif', 'image/webp'],
        // Fixed partner hosts only. Do not add hostname: '**' — that would
        // let the optimizer fetch whatever URL a client passes. Feed images
        // are arbitrary user-content URLs, so they go through the same-origin
        // /api/image-proxy path (localPatterns below). The proxy, not this
        // allowlist, is what blocks SSRF.
        remotePatterns: [
            {
                protocol: 'https',
                hostname: 'media.giphy.com',
            },
            {
                protocol: 'https',
                hostname: 'media0.giphy.com',
            },
            {
                protocol: 'https',
                hostname: 'media1.giphy.com',
            },
            {
                protocol: 'https',
                hostname: 'media2.giphy.com',
            },
            {
                protocol: 'https',
                hostname: 'media3.giphy.com',
            },
            {
                protocol: 'https',
                hostname: 'media4.giphy.com',
            },
            {
                protocol: 'https',
                hostname: 'i.giphy.com',
            },
            {
                protocol: 'https',
                hostname: 'i.imgur.com',
            },
            {
                protocol: 'https',
                hostname: '**.imgur.com',
            },
            {
                protocol: 'https',
                hostname: 'images.ecency.com',
            },
            {
                protocol: 'https',
                hostname: 'images.hive.blog',
            },
        ],
        // localPatterns replaces "allow every local path". The proxy is the
        // only query-string path the optimizer may fetch; its `url` param is
        // checked in the route. Other same-origin images are allowed only
        // when they have no query string (public files, static imports).
        localPatterns: [
            { pathname: '/api/image-proxy' },
            { pathname: '/**', search: '' },
        ],
    },
    webpack: (config, { isServer }) => {
        // Ignore optional native dependencies that don't work in Vercel
        config.resolve.fallback = {
            ...config.resolve.fallback,
            fs: false,
            memcpy: false,
        };

        // Ignore memcpy module completely
        config.externals = config.externals || [];
        config.externals.push({
            'memcpy': 'commonjs memcpy'
        });

        // Resolve .svg imports as plain URL strings. @aioha/react-ui ships
        // `import KeychainIcon from '../icons/keychain.svg'` and renders them
        // via <image href={icon}> — which requires a URL, not Next.js's
        // default StaticImageData object. No other file in the project imports
        // svg directly, so a global rule is safe.
        config.module.rules.push({
            test: /\.svg$/,
            type: 'asset/resource',
        });

        return config;
    }
}

export default nextConfig;

