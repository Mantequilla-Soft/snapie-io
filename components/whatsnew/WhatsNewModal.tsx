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
  Link,
} from '@chakra-ui/react';
import { useEffect, useState } from 'react';
import {
  CHANGELOG,
  LATEST_CHANGELOG_ID,
  getUnseenEntries,
  ChangelogEntry,
} from '@/lib/changelog';
import { useUserSettings, readUserSettings } from '@/hooks/useUserSettings';
import ChangelogEntries from '@/components/changelog/ChangelogEntries';

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
          <ChangelogEntries entries={entries} />
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
