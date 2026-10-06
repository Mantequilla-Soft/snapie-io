'use client';
import { Box, Spinner } from '@chakra-ui/react';
import InfiniteScroll from 'react-infinite-scroll-component';
import PostGrid from '@/components/blog/PostGrid';
import { Discussion } from '@hiveio/dhive';

interface PostsInfiniteScrollProps {
    allPosts: Discussion[];
    fetchPosts: () => Promise<void>;
    viewMode: 'grid' | 'list';
    hasMore?: boolean;
    searchMode?: boolean;
    /** Overflow element this list listens to. Defaults to the shared feed id. */
    scrollableTarget?: string;
}

export default function PostsInfiniteScroll({
    allPosts,
    fetchPosts,
    viewMode,
    hasMore = true,
    searchMode = false,
    scrollableTarget = 'scrollableDiv',
}: PostsInfiniteScrollProps) {

    return (
        <InfiniteScroll
            dataLength={allPosts.length}
            next={fetchPosts}
            hasMore={hasMore}
            loader={
                (<Box display="flex" justifyContent="center" alignItems="center" py={5}>
                    <Spinner size="xl" color="primary" />
                </Box>
                )}
            scrollableTarget={scrollableTarget}
        >
            {allPosts && (
                <PostGrid
                    posts={allPosts ?? []}
                    columns={viewMode === 'grid' ? 3 : 1}
                    searchMode={searchMode}
                />
            )}
        </InfiniteScroll>
    );
}
