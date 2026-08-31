'use client';

import { memo, useRef, useState, useEffect } from 'react';

// Module-scope, same pattern as MediaRenderer's 3Speak caches: SnapList's
// virtualization remounts this component every time its card re-enters the
// scroll window, and each remount was starting back at the 600px placeholder
// until the tweet re-reported its real height — a shrink of ~300px for a
// typical tweet, landing seconds after mount, above the user's viewport.
// Virtuoso re-anchors on that and physically throws the scroll position
// (measured live: a 301px settle triggered a 1579px jump). Caching the
// reported height per tweet means only the first-ever sighting can shift
// layout; every remount starts at the tweet's known height immediately.
const knownTweetHeights = new Map<string, number>();

const TwitterEmbed = memo(function TwitterEmbed({ tweetId }: { tweetId: string }) {
    const iframeRef = useRef<HTMLIFrameElement>(null);
    const [height, setHeight] = useState(() => knownTweetHeights.get(tweetId) ?? 600);

    useEffect(() => {
        const handle = (e: MessageEvent) => {
            if (!e.data || e.source !== iframeRef.current?.contentWindow) return;
            try {
                const d = typeof e.data === 'string' ? JSON.parse(e.data) : e.data;
                // Twitter sends { params: { height } } or { data: { params: { height } } }
                const h = d?.height ?? d?.params?.height ?? d?.data?.params?.height ?? d?.data?.height;
                if (typeof h === 'number' && h > 50) {
                    knownTweetHeights.set(tweetId, h + 2);
                    setHeight(h + 2);
                }
            } catch { /* ignore malformed messages */ }
        };
        window.addEventListener('message', handle);
        return () => window.removeEventListener('message', handle);
    }, [tweetId]);

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
