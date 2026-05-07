'use client';

import { memo, useRef, useState, useEffect } from 'react';

const TwitterEmbed = memo(function TwitterEmbed({ tweetId }: { tweetId: string }) {
    const iframeRef = useRef<HTMLIFrameElement>(null);
    const [height, setHeight] = useState(400);

    useEffect(() => {
        const handle = (e: MessageEvent) => {
            if (!e.data || e.source !== iframeRef.current?.contentWindow) return;
            try {
                const d = typeof e.data === 'string' ? JSON.parse(e.data) : e.data;
                const h = d?.height ?? d?.data?.params?.height;
                if (typeof h === 'number' && h > 50) setHeight(h + 2);
            } catch { /* ignore malformed messages */ }
        };
        window.addEventListener('message', handle);
        return () => window.removeEventListener('message', handle);
    }, []);

    return (
        <div style={{ maxWidth: '550px', margin: '0 auto 8px' }}>
            <iframe
                ref={iframeRef}
                src={`https://platform.twitter.com/embed/Tweet.html?id=${tweetId}&dnt=true`}
                width="100%"
                height={height}
                frameBorder={0}
                scrolling="no"
                loading="lazy"
                style={{ border: 'none', borderRadius: '12px', display: 'block' }}
            />
        </div>
    );
});

export default TwitterEmbed;
