'use client';
import {
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalCloseButton,
  ModalBody,
  ModalFooter,
  Button,
  Text,
  Box,
  Flex,
  Badge,
  Link,
} from '@chakra-ui/react';
import { useEffect, useState } from 'react';
import {
  CHANGELOG,
  LATEST_CHANGELOG_ID,
  getUnseenEntries,
  ChangelogEntry,
  ChangelogItemType,
} from '@/lib/changelog';
import { useUserSettings, readUserSettings } from '@/hooks/useUserSettings';

const TYPE_META: Record<ChangelogItemType, { label: string; colorScheme: string }> = {
  feature: { label: 'New', colorScheme: 'blue' },
  improvement: { label: 'Improved', colorScheme: 'green' },
  fix: { label: 'Fixed', colorScheme: 'orange' },
};

function formatDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function EntryList({ entries }: { entries: ChangelogEntry[] }) {
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

/** Auto-surfacing "What's new" modal. Mounted once (see app/LayoutContent.tsx),
 *  it shows on load when there are changelog entries the user hasn't
 *  acknowledged, and stamps lastSeenChangelogId on dismiss so a reload stays
 *  quiet. Brand-new visitors are marked caught-up silently instead of being
 *  shown the whole history. */
export default function WhatsNewModal() {
  const { update } = useUserSettings();
  const [isOpen, setIsOpen] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [unseen, setUnseen] = useState<ChangelogEntry[]>([]);

  useEffect(() => {
    if (CHANGELOG.length === 0) return;
    // Read the PERSISTED value directly — the shared store hydrates async, so
    // settings.lastSeenChangelogId would still be its null default here and we
    // couldn't tell a returning user apart from a brand-new one.
    const { lastSeenChangelogId } = readUserSettings();
    if (lastSeenChangelogId == null) {
      // Brand-new visitor: don't replay history, just mark them current so the
      // modal starts working from their next visit onward.
      update({ lastSeenChangelogId: LATEST_CHANGELOG_ID });
      return;
    }
    const entries = getUnseenEntries(lastSeenChangelogId);
    if (entries.length > 0) {
      setUnseen(entries);
      setIsOpen(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const dismiss = () => {
    update({ lastSeenChangelogId: LATEST_CHANGELOG_ID });
    setIsOpen(false);
  };

  if (!isOpen) return null;

  const entries = showAll ? CHANGELOG : unseen;
  const count = unseen.length;

  return (
    <Modal isOpen onClose={dismiss} size="md" isCentered scrollBehavior="inside">
      <ModalOverlay />
      <ModalContent>
        <ModalHeader pb={1}>
          What&apos;s new
          {!showAll && (
            <Text fontSize="sm" fontWeight="normal" color="overlay.500">
              {count} update{count === 1 ? '' : 's'} since you were last here
            </Text>
          )}
        </ModalHeader>
        <ModalCloseButton />
        <ModalBody>
          <EntryList entries={entries} />
        </ModalBody>
        <ModalFooter justifyContent="space-between">
          {!showAll && CHANGELOG.length > unseen.length ? (
            <Link fontSize="sm" color="overlay.500" cursor="pointer" onClick={() => setShowAll(true)}>
              See full changelog
            </Link>
          ) : (
            <Box />
          )}
          <Button colorScheme="blue" onClick={dismiss}>
            Got it
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
