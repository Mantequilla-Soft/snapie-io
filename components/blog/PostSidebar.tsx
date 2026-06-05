'use client';
import React, { useEffect, useState } from 'react';
import {
  Box, Avatar, Text, Heading, HStack, VStack, Flex, Link, Spinner,
  Image, Icon,
} from '@chakra-ui/react';
import { FaGlobe, FaMapMarkerAlt } from 'react-icons/fa';
import { useAioha } from '@aioha/react-ui';
import { getProfile, getAccountPosts, getSimilarPosts } from '@/lib/hive/client-functions';
import { getHiveAvatarUrl } from '@/lib/utils/avatarUtils';
import UserActionButtons from '@/components/profile/UserActionButtons';

interface PostSidebarProps {
  author: string;
  permlink: string;
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function MiniPostCard({ title, author, permlink, image, date }: {
  title: string; author: string; permlink: string; image?: string; date?: string;
}) {
  return (
    <Link href={`/@${author}/${permlink}`} _hover={{ textDecoration: 'none' }}>
      <Flex gap={2} align="flex-start" _hover={{ opacity: 0.8 }} transition="opacity 0.15s">
        {image && (
          <Image
            src={image}
            alt={title}
            boxSize="52px"
            objectFit="cover"
            borderRadius="md"
            flexShrink={0}
            fallback={<Box boxSize="52px" borderRadius="md" bg="muted" flexShrink={0} />}
          />
        )}
        <Box minW={0}>
          <Text fontSize="sm" fontWeight="semibold" color="text" noOfLines={2} lineHeight="1.3">
            {title}
          </Text>
          {date && (
            <Text fontSize="xs" color="gray.500" mt={0.5}>{formatDate(date)}</Text>
          )}
          {author && (
            <Text fontSize="xs" color="primary">@{author}</Text>
          )}
        </Box>
      </Flex>
    </Link>
  );
}

function SidebarBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Box border="1px solid" borderColor="muted" borderRadius="10px" p={4}>
      <Text fontSize="xs" fontWeight="bold" textTransform="uppercase" letterSpacing="wider" color="gray.500" mb={3}>
        {title}
      </Text>
      {children}
    </Box>
  );
}

export default function PostSidebar({ author, permlink }: PostSidebarProps) {
  const { user } = useAioha();
  const [profile, setProfile] = useState<any>(null);
  const [recentPosts, setRecentPosts] = useState<any[]>([]);
  const [similarPosts, setSimilarPosts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchAll() {
      setLoading(true);
      const [profileData, accountPosts, similar] = await Promise.all([
        getProfile(author, user || '').catch(() => null),
        getAccountPosts(author, 8, user || '').catch(() => []),
        getSimilarPosts(author, permlink, 3).catch(() => []),
      ]);

      setProfile(profileData);

      const own = (accountPosts || [])
        .filter((p: any) => p.author === author && p.permlink !== permlink)
        .slice(0, 3);
      setRecentPosts(own);

      setSimilarPosts((similar || []).slice(0, 3));
      setLoading(false);
    }
    fetchAll();
  }, [author, permlink, user]);

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" py={8}>
        <Spinner size="md" color="primary" />
      </Box>
    );
  }

  const meta = profile?.metadata?.profile || {};
  const stats = profile?.stats || {};
  const memberYear = profile?.created ? new Date(profile.created).getFullYear() : null;

  return (
    <VStack spacing={4} align="stretch">
      {/* Block 1 — Author Info */}
      <SidebarBlock title="About the author">
        <Link href={`/@${author}`} _hover={{ textDecoration: 'none' }}>
          <Flex align="center" gap={3} mb={3} _hover={{ opacity: 0.85 }} transition="opacity 0.15s">
            <Avatar
              src={getHiveAvatarUrl(author, 'large')}
              name={author}
              boxSize="52px"
              flexShrink={0}
            />
            <Box minW={0}>
              <Flex align="center" gap={1}>
                <Heading as="h3" size="sm" color="primary" isTruncated>
                  {meta.name || author}
                </Heading>
                {profile?.reputation != null && (
                  <Box
                    display="inline-flex"
                    alignItems="center"
                    justifyContent="center"
                    minW="18px"
                    h="18px"
                    px={1}
                    bg="gray.200"
                    borderRadius="sm"
                    fontSize="10px"
                    fontWeight="bold"
                    color="gray.700"
                    flexShrink={0}
                  >
                    {Math.round(profile.reputation)}
                  </Box>
                )}
              </Flex>
              <Text fontSize="xs" color="gray.500">@{author}</Text>
            </Box>
          </Flex>
        </Link>

        {meta.about && (
          <Text fontSize="sm" color="text" noOfLines={3} mb={3} lineHeight="1.5">
            {meta.about}
          </Text>
        )}

        <HStack spacing={4} mb={2} flexWrap="wrap">
          <Box textAlign="center">
            <Text fontSize="sm" fontWeight="bold" color="text">{stats.followers?.toLocaleString() ?? 0}</Text>
            <Text fontSize="xs" color="gray.500">Followers</Text>
          </Box>
          <Box textAlign="center">
            <Text fontSize="sm" fontWeight="bold" color="text">{stats.following?.toLocaleString() ?? 0}</Text>
            <Text fontSize="xs" color="gray.500">Following</Text>
          </Box>
          {profile?.post_count != null && (
            <Box textAlign="center">
              <Text fontSize="sm" fontWeight="bold" color="text">{profile.post_count.toLocaleString()}</Text>
              <Text fontSize="xs" color="gray.500">Posts</Text>
            </Box>
          )}
        </HStack>

        {(meta.location || meta.website || memberYear) && (
          <VStack align="flex-start" spacing={1} mb={3}>
            {meta.location && (
              <Flex align="center" gap={1}>
                <Icon as={FaMapMarkerAlt} w={3} h={3} color="gray.500" />
                <Text fontSize="xs" color="gray.500">{meta.location}</Text>
              </Flex>
            )}
            {meta.website && (
              <Flex align="center" gap={1}>
                <Icon as={FaGlobe} w={3} h={3} color="gray.500" />
                <Text
                  fontSize="xs"
                  color="primary"
                  cursor="pointer"
                  onClick={() => window.open(meta.website, '_blank')}
                  _hover={{ textDecoration: 'underline' }}
                  isTruncated
                  maxW="200px"
                >
                  {meta.website.replace(/^https?:\/\//, '')}
                </Text>
              </Flex>
            )}
            {memberYear && (
              <Text fontSize="xs" color="gray.500">Member since {memberYear}</Text>
            )}
          </VStack>
        )}

        <UserActionButtons
          targetUsername={author}
          currentUsername={user || null}
          showBlacklist={false}
        />
      </SidebarBlock>

      {/* Block 2 — Recent Posts */}
      {recentPosts.length > 0 && (
        <SidebarBlock title="More from this author">
          <VStack spacing={3} align="stretch">
            {recentPosts.map((post) => {
              let image: string | undefined;
              try {
                const jm = typeof post.json_metadata === 'string'
                  ? JSON.parse(post.json_metadata)
                  : post.json_metadata;
                image = jm?.image?.[0];
              } catch { /* no image */ }
              return (
                <MiniPostCard
                  key={post.permlink}
                  title={post.title}
                  author={post.author}
                  permlink={post.permlink}
                  image={image}
                  date={post.created}
                />
              );
            })}
          </VStack>
        </SidebarBlock>
      )}

      {/* Block 3 — Similar Posts */}
      {similarPosts.length > 0 && (
        <SidebarBlock title="Similar posts">
          <VStack spacing={3} align="stretch">
            {similarPosts.map((post: any) => {
              let image: string | undefined;
              try {
                const jm = typeof post.json_metadata === 'string'
                  ? JSON.parse(post.json_metadata)
                  : post.json_metadata;
                image = jm?.image?.[0];
              } catch { /* no image */ }
              return (
                <MiniPostCard
                  key={`${post.author}-${post.permlink}`}
                  title={post.title}
                  author={post.author}
                  permlink={post.permlink}
                  image={image}
                  date={post.created}
                />
              );
            })}
          </VStack>
        </SidebarBlock>
      )}
    </VStack>
  );
}
