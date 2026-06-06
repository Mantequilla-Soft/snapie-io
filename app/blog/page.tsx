'use client';
import { Box, Text } from '@chakra-ui/react';
import { useState, useRef, useEffect } from 'react';
import { Discussion } from '@hiveio/dhive';
import { findPosts, searchPosts } from '@/lib/hive/client-functions';
import { mutedAccountsManager } from '@/lib/hive/muted-accounts';
import { useHiveUser } from '@/contexts/UserContext';
import TopBar from '@/components/blog/TopBar';
import PostInfiniteScroll from '@/components/blog/PostInfiniteScroll';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

export default function Blog() {
    const { hiveUser } = useHiveUser();
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
    const [query, setQuery] = useState('created');
    const [searchTerm, setSearchTerm] = useState(searchParams.get('q') || '');
    const [activeSearchTerm, setActiveSearchTerm] = useState(searchParams.get('q') || '');
    const [allPosts, setAllPosts] = useState<Discussion[]>([]);
    const [hasMore, setHasMore] = useState(true);
    const [mutedLoaded, setMutedLoaded] = useState(false);
    const isFetching = useRef(false);
    const mutedSetRef = useRef<Set<string>>(new Set());

    const tag = process.env.NEXT_PUBLIC_HIVE_SEARCH_TAG

    const params = useRef({
        tag: tag,
        limit: 20,
        start_author: '',
        start_permlink: '',
    });

    useEffect(() => {
        const initial = searchParams.get('q') || '';
        setSearchTerm(initial);
        setActiveSearchTerm(initial);
    }, [searchParams]);

    async function fetchPosts() {
        if (isFetching.current) return;
        isFetching.current = true;
        try {
            if (activeSearchTerm) {
                const results = await searchPosts(activeSearchTerm, {
                    limit: 20,
                    truncate: 320,
                    fullPosts: 10,
                    observer: hiveUser?.name || '',
                });

                const seenKeys = new Set<string>();
                const topLevelResults = results.filter((post: Discussion) => {
                    const title = typeof post.title === 'string' ? post.title.trim() : '';
                    const body = typeof post.body === 'string' ? post.body.trim() : '';
                    const isTopLevel = !post.parent_author;
                    const isMuted = mutedSetRef.current.has(post.author.toLowerCase());
                    const author = post.author || '';
                    const permlink = post.permlink || '';
                    const dedupeKey = `${author}/${permlink}`;
                    const hasRenderableContent = Boolean(title && body);
                    const hasGarbageNaN = /na+a+n/i.test(title) || /na+a+n/i.test(body);
                    const isDuplicate = seenKeys.has(dedupeKey);
                    if (!isDuplicate && author && permlink) seenKeys.add(dedupeKey);
                    return (
                        isTopLevel &&
                        !isMuted &&
                        !isDuplicate &&
                        Boolean(author && permlink) &&
                        hasRenderableContent &&
                        !hasGarbageNaN
                    );
                }).sort((a: Discussion, b: Discussion) => {
                    const aTime = a.created ? new Date(a.created).getTime() : 0;
                    const bTime = b.created ? new Date(b.created).getTime() : 0;
                    return bTime - aTime;
                });

                setAllPosts(topLevelResults);
                setHasMore(false);
                isFetching.current = false;
                return;
            }

            const posts = await findPosts(query, params.current);

            if (posts.length === 0) {
                setHasMore(false);
                isFetching.current = false;
                return;
            }

            // Filter out comments and muted accounts
            const topLevelPosts = posts.filter((post: Discussion) => {
                const isTopLevel = !post.parent_author;
                const isMuted = mutedSetRef.current.has(post.author.toLowerCase());
                return isTopLevel && !isMuted;
            });

            setAllPosts(prevPosts => [...prevPosts, ...topLevelPosts]);

            // Advance cursor to last post from the API batch (not filtered list)
            // so we don't re-fetch posts that were filtered out
            const lastPost = posts[posts.length - 1];
            params.current = {
                tag: tag,
                limit: 20,
                start_author: lastPost?.author || '',
                start_permlink: lastPost?.permlink || '',
            };

            if (posts.length < 20) setHasMore(false);

            isFetching.current = false;
        } catch (error) {
            console.log(error);
            isFetching.current = false;
        }
    }

    useEffect(() => {
        const next = new URLSearchParams(searchParams.toString());
        if (activeSearchTerm) next.set('q', activeSearchTerm);
        else next.delete('q');

        const queryString = next.toString();
        router.replace(queryString ? `${pathname}?${queryString}` : pathname);
    }, [activeSearchTerm, pathname, router, searchParams]);

    // Load muted accounts on mount and when user changes (login/logout)
    useEffect(() => {
        setMutedLoaded(false);
        const loadMutedAccounts = async () => {
            const mutedSet = await mutedAccountsManager.getMutedList(hiveUser?.name);
            mutedSetRef.current = mutedSet;
            setMutedLoaded(true);
        };
        loadMutedAccounts();
    }, [hiveUser?.name]);

    useEffect(() => {
        if (!mutedLoaded) return; // Wait for muted accounts to load
        
        setAllPosts([]);
        setHasMore(!activeSearchTerm);
        params.current = {
            tag: tag,
            limit: 20,
            start_author: '',
            start_permlink: '',
        };
        fetchPosts();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [query, mutedLoaded, tag, activeSearchTerm, hiveUser?.name]); // fetchPosts excluded - callback identity changes each render

    const submitSearch = () => {
        setActiveSearchTerm(searchTerm.trim());
    };

    const clearSearch = () => {
        setSearchTerm('');
        setActiveSearchTerm('');
    };

    return (
        <Box
            id="scrollableDiv"
            mt="3"
            px={4}
            h="100vh"
            overflowY="auto"
            sx={{
                '&::-webkit-scrollbar': {
                    display: 'none',
                },
                scrollbarWidth: 'none',
            }}
        >
            <TopBar
                viewMode={viewMode}
                setViewMode={setViewMode}
                activeQuery={query}
                setQuery={setQuery}
                searchTerm={searchTerm}
                setSearchTerm={setSearchTerm}
                onSearchSubmit={submitSearch}
                onSearchClear={clearSearch}
            />
            {activeSearchTerm && (
                <Text fontSize="sm" color="text" opacity={0.75} mb={3}>
                    {`Search results for "${activeSearchTerm}" (${allPosts.length})`}
                </Text>
            )}
            <PostInfiniteScroll
                allPosts={allPosts}
                fetchPosts={fetchPosts}
                viewMode={viewMode}
                hasMore={hasMore}
                searchMode={Boolean(activeSearchTerm)}
            />
        </Box>
    );
}
