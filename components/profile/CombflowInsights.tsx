'use client';
import { Box, Flex, Text, Tag, TagLabel, HStack, Skeleton, SkeletonText } from '@chakra-ui/react';
import NextLink from 'next/link';
import { useCombflowSummary } from '@/hooks/useCombflowSummary';

const LANG_NAMES: Record<string, string> = {
    en: 'English', es: 'Spanish', de: 'German', fr: 'French', pt: 'Portuguese',
    it: 'Italian', nl: 'Dutch', ru: 'Russian', zh: 'Chinese', ja: 'Japanese',
    ko: 'Korean', ar: 'Arabic', pl: 'Polish', tr: 'Turkish', vi: 'Vietnamese',
    id: 'Indonesian', cs: 'Czech', sv: 'Swedish', fi: 'Finnish', ro: 'Romanian',
};

function formatFirstSeen(iso: string): string {
    const d = new Date(iso);
    return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

interface CombflowInsightsProps {
    username: string;
}

export default function CombflowInsights({ username }: CombflowInsightsProps) {
    const { summary, isLoading } = useCombflowSummary(username);

    if (isLoading) {
        return (
            <Box
                bg="surface"
                border="tb1"
                borderRadius="12px"
                px={4}
                py={3}
                mb={3}
            >
                <Skeleton height="10px" width="120px" mb={3} />
                <HStack spacing={2} mb={3}>
                    <Skeleton height="24px" width="80px" borderRadius="full" />
                    <Skeleton height="24px" width="90px" borderRadius="full" />
                    <Skeleton height="24px" width="70px" borderRadius="full" />
                </HStack>
                <SkeletonText noOfLines={1} width="60%" />
            </Box>
        );
    }

    if (!summary) return null;

    const langs = summary.top_languages
        .slice(0, 2)
        .map(l => LANG_NAMES[l.code] ?? l.code.toUpperCase())
        .join(' · ');

    return (
        <Box
            bg="surface"
            border="tb1"
            borderRadius="12px"
            px={4}
            py={3}
            mb={3}
        >
            <Text
                fontSize="xs"
                fontWeight="bold"
                color="overlay.400"
                letterSpacing="widest"
                textTransform="uppercase"
                mb={3}
            >
                Content Profile
            </Text>

            {/* Topic pills */}
            {summary.top_categories.length > 0 && (
                <Flex wrap="wrap" gap={2} mb={3}>
                    {summary.top_categories.map(cat => (
                        <Tag
                            key={cat.id}
                            as={NextLink}
                            href={`/explore/${encodeURIComponent(cat.name)}`}
                            size="sm"
                            borderRadius="full"
                            bg="rgba(28, 161, 241, 0.10)"
                            border="1px solid rgba(28, 161, 241, 0.20)"
                            color="overlay.800"
                            cursor="pointer"
                            _hover={{ bg: 'rgba(28, 161, 241, 0.22)', borderColor: 'rgba(28, 161, 241, 0.45)', textDecoration: 'none' }}
                            transition="all 0.15s"
                            px={3}
                        >
                            <TagLabel>{cat.name}</TagLabel>
                        </Tag>
                    ))}
                </Flex>
            )}

            {/* Stats row */}
            <HStack spacing={3} flexWrap="wrap" divider={<Text color="overlay.300" fontSize="xs">·</Text>}>
                <Text fontSize="xs" color="overlay.500">
                    <Text as="span" color="overlay.800" fontWeight="semibold">
                        {summary.total_posts.toLocaleString()}
                    </Text>{' '}posts
                </Text>
                {summary.first_seen && (
                    <Text fontSize="xs" color="overlay.500">
                        on Hive since{' '}
                        <Text as="span" color="overlay.800" fontWeight="semibold">
                            {formatFirstSeen(summary.first_seen)}
                        </Text>
                    </Text>
                )}
                {langs && (
                    <Text fontSize="xs" color="overlay.500">
                        writes in{' '}
                        <Text as="span" color="overlay.800" fontWeight="semibold">
                            {langs}
                        </Text>
                    </Text>
                )}
                {summary.top_community && (
                    <Text fontSize="xs" color="overlay.500">
                        top community{' '}
                        <Text as="span" color="primary" fontWeight="semibold">
                            {summary.top_community.name}
                        </Text>
                    </Text>
                )}
            </HStack>
        </Box>
    );
}
