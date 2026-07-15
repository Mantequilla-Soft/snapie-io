'use client';
import { Box, Text, Flex, Badge } from '@chakra-ui/react';
import { ChangelogEntry, ChangelogItemType } from '@/lib/changelog';

const TYPE_META: Record<ChangelogItemType, { label: string; colorScheme: string }> = {
  feature: { label: 'New', colorScheme: 'blue' },
  improvement: { label: 'Improved', colorScheme: 'green' },
  fix: { label: 'Fixed', colorScheme: 'orange' },
};

function formatDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

/** Shared renderer for a list of changelog entries — used both by the
 *  auto-surfacing WhatsNewModal and the full /changelog page, so the two never
 *  drift apart. */
export default function ChangelogEntries({ entries }: { entries: ChangelogEntry[] }) {
  return (
    <>
      {entries.map((entry, i) => (
        <Box
          key={entry.id}
          pt={i === 0 ? 0 : 4}
          mt={i === 0 ? 0 : 4}
          borderTop={i === 0 ? undefined : '1px solid'}
          borderColor="overlay.200"
        >
          <Text fontSize="xs" fontWeight="bold" color="overlay.500" mb={2}>
            {formatDate(entry.date)}
            {entry.title ? ` · ${entry.title}` : ''}
          </Text>
          {entry.items.map((item, j) => {
            const meta = TYPE_META[item.type];
            return (
              <Flex key={j} gap={2} mb={j === entry.items.length - 1 ? 0 : 2} align="flex-start">
                <Badge
                  colorScheme={meta.colorScheme}
                  flexShrink={0}
                  textTransform="none"
                  borderRadius="md"
                  px={2}
                  mt="1px"
                >
                  {meta.label}
                </Badge>
                <Text fontSize="sm">{item.text}</Text>
              </Flex>
            );
          })}
        </Box>
      ))}
    </>
  );
}
