'use client';
import React, { useState, useEffect } from 'react';
import { Box, HStack, VStack, Text, Image, Skeleton, SkeletonText, Link } from '@chakra-ui/react';
import HiveClient from '@/lib/hive/hiveclient';
import { getCommunityInfo } from '@/lib/hive/client-functions';
import NextLink from 'next/link';
import ReSnap from './ReSnap';
import { Comment } from '@hiveio/dhive';

interface HivePostPreviewProps {
  author: string;
  permlink: string;
}

interface PostData {
  title: string;
  author: string;
  category: string;
  categoryName: string; // Display name for the category
  body: string;
  image?: string;
  reputation?: number;
}

export default function HivePostPreview({ author, permlink }: HivePostPreviewProps) {
  const [postData, setPostData] = useState<PostData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [isReSnap, setIsReSnap] = useState(false);
  const [snapData, setSnapData] = useState<Comment | null>(null);

  useEffect(() => {
    const fetchPostData = async () => {
      try {
        const post = await HiveClient.database.call('get_content', [author, permlink]);
        
        if (!post || !post.author) {
          setError(true);
          return;
        }

        // Check if this is a comment (re-snap) or a top-level post
        if (post.parent_author && post.parent_author !== '') {
          // This is a comment/reply - render as Re-Snap
          setIsReSnap(true);
          setSnapData(post as Comment);
          setLoading(false);
          return;
        }

        // Parse metadata for image
        let image = undefined;
        try {
          const metadata = JSON.parse(post.json_metadata);
          if (metadata.image && metadata.image.length > 0) {
            image = metadata.image[0];
          }
        } catch (e) {
          // No image metadata
        }

        // Get excerpt (first 150 characters of body)
        // Strip all HTML tags and markdown, then extract plain text
        let cleanBody = post.body
          .replace(/<[^>]*>/g, '') // Remove all HTML tags
          .replace(/!\[.*?\]\(.*?\)/g, '') // Remove markdown images
          .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // Convert markdown links to just text
          .replace(/[#*_~`>]/g, '') // Remove markdown symbols
          .replace(/https?:\/\/[^\s]+/g, '') // Remove URLs
          .replace(/\n+/g, ' ') // Replace newlines with spaces
          .trim();
        
        const excerpt = cleanBody.slice(0, 150).trim() + '...';

        // Get category display name
        let categoryName = post.category || 'blog';
        
        // Check if it's a community (starts with hive-)
        if (categoryName.startsWith('hive-')) {
          try {
            // Check cache first
            const cachedData = sessionStorage.getItem(`community-${categoryName}`);
            if (cachedData) {
              const communityData = JSON.parse(cachedData);
              categoryName = communityData.title;
            } else {
              // Fetch community info
              const communityData = await getCommunityInfo(categoryName);
              if (communityData && communityData.title) {
                categoryName = communityData.title;
                // Cache it
                sessionStorage.setItem(`community-${post.category}`, JSON.stringify(communityData));
              }
            }
          } catch (e) {
            // If we can't fetch, keep the original tag
            console.error('Error fetching community info:', e);
          }
        }

        setPostData({
          title: post.title,
          author: post.author,
          category: post.category,
          categoryName,
          body: excerpt,
          image,
          reputation: post.author_reputation,
        });
      } catch (err) {
        console.error('Error fetching post preview:', err);
        setError(true);
      } finally {
        setLoading(false);
      }
    };

    fetchPostData();
  }, [author, permlink]);

  if (error) {
    return null; // Don't render anything if there's an error
  }

  if (loading) {
    return (
      <Box
        bg="muted"
        borderWidth="2px"
        borderColor="border"
        borderRadius="md"
        p={3}
        my={2}
        maxW="full"
      >
        <HStack spacing={3} align="start">
          <Skeleton width="80px" height="80px" borderRadius="md" />
          <VStack align="start" flex={1} spacing={2}>
            <Skeleton height="20px" width="80%" />
            <Skeleton height="16px" width="40%" />
            <SkeletonText noOfLines={2} spacing={2} width="100%" />
          </VStack>
        </HStack>
      </Box>
    );
  }

  // If it's a re-snap (comment), render ReSnap component
  if (isReSnap && snapData) {
    return <ReSnap comment={snapData} />;
  }

  if (!postData) {
    return null;
  }

  return (
    <Link
      as={NextLink}
      href={`/@${author}/${permlink}`}
      _hover={{ textDecoration: 'none' }}
    >
      <Box
        bg="muted"
        borderWidth="2px"
        borderColor="border"
        borderRadius="md"
        p={3}
        my={2}
        maxW="full"
        cursor="pointer"
        transition="all 0.2s"
        _hover={{
          borderColor: 'primary',
          transform: 'translateY(-2px)',
          shadow: 'md',
        }}
      >
        <HStack spacing={3} align="start">
          {postData.image && (
            <Image
              src={postData.image}
              alt={postData.title}
              width="80px"
              height="80px"
              objectFit="cover"
              borderRadius="md"
              fallbackSrc="https://via.placeholder.com/80"
            />
          )}
          <VStack align="start" flex={1} spacing={1}>
            <Text
              fontWeight="bold"
              fontSize="md"
              color="text"
              noOfLines={2}
              lineHeight="1.3"
            >
              {postData.title}
            </Text>
            <HStack spacing={2}>
              <Text fontSize="xs" color="accent">
                by @{postData.author}
              </Text>
              <Text fontSize="xs" color="secondary">
                {postData.categoryName}
              </Text>
            </HStack>
            <Text fontSize="sm" color="text" noOfLines={2} opacity={0.8}>
              {postData.body}
            </Text>
          </VStack>
        </HStack>
      </Box>
    </Link>
  );
}
