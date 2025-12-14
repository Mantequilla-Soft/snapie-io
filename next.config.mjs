/** @type {import('next').NextConfig} */
const nextConfig = {
    experimental: {
        serverActions: {
            bodySizeLimit: '10mb', // Increase the body size limit
        },
    },
    images: {
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
        
        return config;
    }
}

export default nextConfig;

