'use client';
import {
  Modal, ModalOverlay, ModalContent, ModalHeader, ModalBody, ModalFooter, ModalCloseButton,
  Button, FormControl, FormLabel, Input, Textarea, Select, VStack, useToast,
} from '@chakra-ui/react';
import { useState } from 'react';
import { useHangout } from '@/contexts/HangoutContext';
import type { HangoutsEvent } from '@snapie/hangouts-core';

interface ScheduleEventModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated: (event: HangoutsEvent) => void;
}

export default function ScheduleEventModal({ isOpen, onClose, onCreated }: ScheduleEventModalProps) {
  const { createEvent } = useHangout();
  const toast = useToast();

  const [title, setTitle] = useState('');
  const [scheduledAt, setScheduledAt] = useState('');
  const [description, setDescription] = useState('');
  const [visibility, setVisibility] = useState<'public' | 'unlisted'>('public');
  const [loading, setLoading] = useState(false);

  const minDateTime = new Date(Date.now() + 5 * 60 * 1000)
    .toISOString()
    .slice(0, 16);

  const handleSubmit = async () => {
    if (!title.trim() || !scheduledAt) return;
    setLoading(true);
    const event = await createEvent({
      title: title.trim(),
      scheduledAt: new Date(scheduledAt).toISOString(),
      description: description.trim() || undefined,
      visibility,
    });
    setLoading(false);

    if (event) {
      toast({ title: 'OpenPod scheduled!', status: 'success', duration: 3000 });
      setTitle('');
      setScheduledAt('');
      setDescription('');
      setVisibility('public');
      onCreated(event);
      onClose();
    } else {
      toast({ title: 'Failed to schedule OpenPod', status: 'error', duration: 4000 });
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="md" isCentered>
      <ModalOverlay backdropFilter="blur(6px)" />
      <ModalContent bg="muted" borderColor="border" borderWidth="1px" color="text">
        <ModalHeader fontSize="lg" fontWeight={700}>Schedule an OpenPod</ModalHeader>
        <ModalCloseButton />
        <ModalBody>
          <VStack spacing={4}>
            <FormControl isRequired>
              <FormLabel fontSize="sm">Title</FormLabel>
              <Input
                placeholder="What's this OpenPod about?"
                value={title}
                onChange={e => setTitle(e.target.value)}
                maxLength={80}
              />
            </FormControl>
            <FormControl isRequired>
              <FormLabel fontSize="sm">Date & Time</FormLabel>
              <Input
                type="datetime-local"
                value={scheduledAt}
                min={minDateTime}
                onChange={e => setScheduledAt(e.target.value)}
              />
            </FormControl>
            <FormControl>
              <FormLabel fontSize="sm">Description</FormLabel>
              <Textarea
                placeholder="Optional — tell people what to expect"
                value={description}
                onChange={e => setDescription(e.target.value)}
                rows={3}
                maxLength={500}
                resize="none"
              />
            </FormControl>
            <FormControl>
              <FormLabel fontSize="sm">Visibility</FormLabel>
              <Select value={visibility} onChange={e => setVisibility(e.target.value as 'public' | 'unlisted')}>
                <option value="public">Public — listed for everyone</option>
                <option value="unlisted">Unlisted — link only</option>
              </Select>
            </FormControl>
          </VStack>
        </ModalBody>
        <ModalFooter gap={2}>
          <Button variant="ghost" onClick={onClose} size="sm">Cancel</Button>
          <Button
            colorScheme="blue"
            size="sm"
            isLoading={loading}
            isDisabled={!title.trim() || !scheduledAt}
            onClick={handleSubmit}
          >
            Schedule
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
