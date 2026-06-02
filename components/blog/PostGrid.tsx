// components/PostGrid.tsx
import { SimpleGrid } from '@chakra-ui/react';
import React from 'react';
import PostCard from './PostCard';
import { Discussion } from '@hiveio/dhive';
//import { Post } from '@/app/types/Posts';
// I have created a type for the posts in the app/types/Posts.ts file. but may be we can get from dhive or keychain sdk


interface PostGridProps {
    posts: Discussion[];
    columns: 1 | 2 | 3 | 4;
    searchMode?: boolean;
}

export default function PostGrid({ posts, columns, searchMode = false }: PostGridProps) {

    return (
        <SimpleGrid
            columns={{ base: 1, sm: columns === 1 ? 1 : 2, md: columns, lg: columns, xl: columns }}
            spacing={4}
        >
            {posts.map((post) => (
                <PostCard key={`${post.author}/${post.permlink}`} post={post} compact={searchMode} />
            ))}
        </SimpleGrid>
    );
}
