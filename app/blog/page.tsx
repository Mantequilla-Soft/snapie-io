'use client';
import { Container } from '@chakra-ui/react';
import { useState, useRef, useEffect } from 'react';
import { Discussion } from '@hiveio/dhive';
import { findPosts, getCommunityMutedAccounts } from '@/lib/hive/client-functions';
import TopBar from '@/components/blog/TopBar';
import PostInfiniteScroll from '@/components/blog/PostInfiniteScroll';

export default function Blog() {
    const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
    const [query, setQuery] = useState("created");
    const [allPosts, setAllPosts] = useState<Discussion[]>([]);
    const [mutedLoaded, setMutedLoaded] = useState(false);
    const isFetching = useRef(false);
    const mutedAccountsRef = useRef<string[]>([]);

    const tag = process.env.NEXT_PUBLIC_HIVE_SEARCH_TAG
    const communityTag = process.env.NEXT_PUBLIC_HIVE_COMMUNITY_TAG

    const params = useRef({
        tag: tag,
        limit: 12,
        start_author: '',
        start_permlink: '',
    });

    async function fetchPosts() {
        if (isFetching.current) return; // Prevent multiple fetches
        isFetching.current = true;
        try {
            const posts = await findPosts(query, params.current);
            
            // Filter out comments and muted accounts
            const topLevelPosts = posts.filter((post: Discussion) => {
                const isTopLevel = post.parent_author === '';
                const isMuted = mutedAccountsRef.current.includes(post.author);
                return isTopLevel && !isMuted;
            });
            
            if (topLevelPosts.length > 0) {
                setAllPosts(prevPosts => [...prevPosts, ...topLevelPosts]);
                // Use last visible post for pagination
                const lastVisible = topLevelPosts[topLevelPosts.length - 1] ?? posts[posts.length - 1];
                params.current = {
                    tag: tag,
                    limit: 12,
                    start_author: lastVisible?.author || '',
                    start_permlink: lastVisible?.permlink || '',
                };
            }
            isFetching.current = false;
        } catch (error) {
            console.log(error);
            isFetching.current = false;
        }
    }

    // Fetch community muted accounts on mount
    useEffect(() => {
        const fetchMutedAccounts = async () => {
            if (communityTag) {
                const muted = await getCommunityMutedAccounts(communityTag);
                mutedAccountsRef.current = muted;
                setMutedLoaded(true);
            }
        };
        fetchMutedAccounts();
    }, [communityTag]);

    useEffect(() => {
        if (!mutedLoaded) return; // Wait for muted accounts to load
        
        setAllPosts([]);
        params.current = {
            tag: tag,
            limit: 12,
            start_author: '',
            start_permlink: '',
        };
        fetchPosts();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [query, mutedLoaded, tag]); // fetchPosts excluded - callback identity changes each render

    return (
        <Container
            id="scrollableDiv"
            maxW="container.lg"
            mt="3"
            h="100vh"
            overflowY="auto"
            sx={{
                '&::-webkit-scrollbar': {
                    display: 'none',
                },
                scrollbarWidth: 'none',
            }}
        >
            <TopBar viewMode={viewMode} setViewMode={setViewMode} setQuery={setQuery} />
            <PostInfiniteScroll allPosts={allPosts} fetchPosts={fetchPosts} viewMode={viewMode} />
        </Container>
    );
}
