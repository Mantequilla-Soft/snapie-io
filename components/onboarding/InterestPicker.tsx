'use client';
import {
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalCloseButton,
  ModalBody,
  ModalFooter,
  Text,
  Button,
  Wrap,
  WrapItem,
  Tag,
} from '@chakra-ui/react';
import { useState } from 'react';
import { INTEREST_TOPICS } from '@/lib/discovery/interestTopics';
import { useUserSettings } from '@/hooks/useUserSettings';

interface InterestPickerProps {
  onDone: () => void;
  /** 'onboarding' (default): first-run, forced choice — Skip stamps
   *  interestsOnboardedAt with an empty list, no close-on-overlay/X escape.
   *  'edit': reopened later from Settings — pre-populates from the user's
   *  current interestTags, Cancel closes without touching settings at all
   *  (unlike Skip, it must never silently wipe an existing selection), and
   *  the modal is dismissible normally (X / overlay click / Esc). */
  mode?: 'onboarding' | 'edit';
}

/** Personalization-signal picker for the "For You" warm state — only ever
 *  mounted while gated by the discovery flag + allowlist (see
 *  app/LayoutContent.tsx for the onboarding mount, app/settings/page.tsx for
 *  the edit-mode reopen). An empty interestTags list is treated as
 *  cold-start by the ranking layer (see app/page.tsx) regardless of how it
 *  got that way (skipped onboarding vs. edited down to nothing). */
export default function InterestPicker({ onDone, mode = 'onboarding' }: InterestPickerProps) {
  const { settings, update } = useUserSettings();
  const isEdit = mode === 'edit';

  const [selected, setSelected] = useState<Set<number>>(() => {
    if (!isEdit) return new Set();
    const current = new Set(settings.interestTags);
    const preselected = new Set<number>();
    INTEREST_TOPICS.forEach((topic, i) => {
      if (topic.tags.some(tag => current.has(tag))) preselected.add(i);
    });
    return preselected;
  });

  const toggle = (index: number) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  const finish = (tags: string[]) => {
    update({ interestTags: tags, interestsOnboardedAt: Date.now() });
    onDone();
  };

  const handleSave = () => {
    const tags = [...selected].flatMap(i => INTEREST_TOPICS[i].tags);
    finish(tags);
  };

  // Onboarding only — stamps an empty selection so the modal never
  // reappears. Never used in edit mode (see handleCancel).
  const handleSkip = () => finish([]);

  // Edit only — closes without calling update() at all, so an accidental
  // dismiss can never wipe an existing selection back to empty.
  const handleCancel = () => onDone();

  return (
    <Modal isOpen onClose={isEdit ? handleCancel : handleSkip} size="lg" closeOnOverlayClick={isEdit}>
      <ModalOverlay />
      <ModalContent>
        <ModalHeader>{isEdit ? 'Edit your interests' : 'What are you into?'}</ModalHeader>
        {isEdit && <ModalCloseButton />}
        <ModalBody>
          <Text fontSize="sm" color="overlay.500" mb={4}>
            {isEdit
              ? 'Update the topics "For You" matches against — from any community, not just Snapie\'s.'
              : 'Pick a few topics and "For You" will start surfacing posts and snaps that match — from any community, not just Snapie\'s. You can skip this and it\'ll just show Snapie\'s own trending content instead.'}
          </Text>
          <Wrap spacing={2}>
            {INTEREST_TOPICS.map((topic, i) => {
              const isSelected = selected.has(i);
              return (
                <WrapItem key={topic.label}>
                  <Tag
                    as="button"
                    onClick={() => toggle(i)}
                    size="lg"
                    borderRadius="full"
                    px={4}
                    py={2}
                    cursor="pointer"
                    bg={isSelected ? 'primary' : 'transparent'}
                    color={isSelected ? 'white' : 'text'}
                    border="1px solid"
                    borderColor={isSelected ? 'primary' : 'overlay.300'}
                    fontWeight={isSelected ? 'bold' : 'medium'}
                    transition="all 0.15s"
                  >
                    {topic.label}
                  </Tag>
                </WrapItem>
              );
            })}
          </Wrap>
        </ModalBody>
        <ModalFooter>
          <Button variant="ghost" mr={3} onClick={isEdit ? handleCancel : handleSkip}>
            {isEdit ? 'Cancel' : 'Skip for now'}
          </Button>
          <Button colorScheme="blue" onClick={handleSave}>
            {isEdit ? 'Save changes' : 'Save interests'}
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
