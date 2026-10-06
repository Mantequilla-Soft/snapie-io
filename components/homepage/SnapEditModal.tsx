'use client';

import {
  Button,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
  Textarea,
} from '@chakra-ui/react';

interface SnapEditModalProps {
  body: string;
  isEditing: boolean;
  onChange: (value: string) => void;
  onClose: () => void;
  onSubmit: () => void;
}

/** Edit dialog. Loaded when the author opens it, not with the card. */
export default function SnapEditModal({ body, isEditing, onChange, onClose, onSubmit }: SnapEditModalProps) {
  return (
    <Modal isOpen onClose={onClose} size="xl">
      <ModalOverlay />
      <ModalContent>
        <ModalHeader>Edit Post</ModalHeader>
        <ModalBody>
          <Textarea
            value={body}
            onChange={(e) => onChange(e.target.value)}
            placeholder="Edit your post..."
            rows={10}
            bg="background"
            border="tb1"
          />
        </ModalBody>
        <ModalFooter>
          <Button variant="ghost" mr={3} onClick={onClose} isDisabled={isEditing}>
            Cancel
          </Button>
          <Button colorScheme="blue" onClick={onSubmit} isLoading={isEditing} loadingText="Updating...">
            Update
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
