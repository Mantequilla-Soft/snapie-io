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
}

export default function PostsInfiniteScroll({
    allPosts,
    fetchPosts,
    viewMode,
    hasMore = true,
    searchMode = false,
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
            scrollableTarget="scrollableDiv"
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
