'use client';

import { useState } from 'react';
import {
  Alert,
  AlertIcon,
  Button,
  FormControl,
  FormLabel,
  Input,
  Link,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
  Select,
  Text,
  Textarea,
  VStack,
} from '@chakra-ui/react';
import { readChatSessionToken, submitFeedback } from '@/lib/feedback/client';
import type { FeedbackCategory } from '@/lib/feedback/model';

interface FeedbackModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function FeedbackModal({ isOpen, onClose }: FeedbackModalProps) {
  const [category, setCategory] = useState<FeedbackCategory | ''>('');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [issueUrl, setIssueUrl] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  function reset() {
    setCategory('');
    setTitle('');
    setBody('');
    setSubmitting(false);
    setError(null);
    setIssueUrl(null);
    setSent(false);
  }

  function handleClose() {
    reset();
    onClose();
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (submitting) return;

    const nextTitle = title.trim();
    const nextBody = body.trim();
    if (!nextTitle || !nextBody) {
      setError('Add a short title and a message.');
      return;
    }

    setSubmitting(true);
    setError(null);
    const result = await submitFeedback({
      title: nextTitle,
      body: nextBody,
      category,
      pageUrl: window.location.href,
      chatToken: readChatSessionToken(),
    });
    setSubmitting(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }
    setSent(true);
    setIssueUrl(result.url);
  }

  return (
    <Modal isOpen={isOpen} onClose={handleClose} isCentered motionPreset="slideInBottom" size="md">
      <ModalOverlay backdropFilter="blur(4px)" />
      <ModalContent mx={4} bg="surface" border="1px solid" borderColor="surfaceBorder" borderRadius="16px">
        <ModalHeader pb={2} color="text">Send feedback</ModalHeader>
        <ModalCloseButton />
        <ModalBody pb={2}>
          {sent ? (
            <VStack align="stretch" spacing={3}>
              <Alert status="success" borderRadius="md">
                <AlertIcon />
                <Text fontSize="sm">Thanks — we got it.</Text>
              </Alert>
              {issueUrl && (
                <Link href={issueUrl} isExternal color="primary" fontSize="sm" fontWeight="medium">
                  View the GitHub issue
                </Link>
              )}
            </VStack>
          ) : (
            <VStack as="form" align="stretch" spacing={4} onSubmit={handleSubmit}>
              <Text color="overlay.500" fontSize="sm">
                Bugs, ideas, or anything that felt off. If you&apos;re signed in we note your Hive username. Guests can send this too. We don&apos;t attach your email or IP.
              </Text>

              {error && (
                <Alert status="error" borderRadius="md">
                  <AlertIcon />
                  <Text fontSize="sm">{error}</Text>
                </Alert>
              )}

              <FormControl>
                <FormLabel fontSize="sm" color="text">Category</FormLabel>
                <Select
                  value={category}
                  onChange={(event) => setCategory(event.target.value as FeedbackCategory | '')}
                  borderRadius="10px"
                  aria-label="Category"
                >
                  <option value="">General feedback</option>
                  <option value="bug">Bug</option>
                  <option value="idea">Idea</option>
                  <option value="other">Other</option>
                </Select>
              </FormControl>

              <FormControl>
                <FormLabel fontSize="sm" color="text">Title</FormLabel>
                <Input
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder="Short summary"
                  maxLength={120}
                  borderRadius="10px"
                  aria-label="Title"
                />
              </FormControl>

              <FormControl>
                <FormLabel fontSize="sm" color="text">Message</FormLabel>
                <Textarea
                  value={body}
                  onChange={(event) => setBody(event.target.value)}
                  placeholder="What happened, or what would you like to see?"
                  maxLength={4000}
                  rows={5}
                  borderRadius="10px"
                  aria-label="Message"
                />
              </FormControl>

              <Button
                type="submit"
                colorScheme="blue"
                borderRadius="10px"
                alignSelf="flex-end"
                isLoading={submitting}
                loadingText="Sending"
              >
                Send feedback
              </Button>
            </VStack>
          )}
        </ModalBody>
        {sent && (
          <ModalFooter>
            <Button onClick={handleClose} colorScheme="blue" borderRadius="10px">
              Close
            </Button>
          </ModalFooter>
        )}
      </ModalContent>
    </Modal>
  );
}
