'use client';

import { useRef, useState } from 'react';
import {
  Alert,
  AlertIcon,
  Button,
  FormControl,
  FormHelperText,
  FormLabel,
  Image,
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
import { validateFeedbackScreenshotFile } from '@/lib/feedback/model';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { uploadImageWithKeychain } from '@/lib/hive/client-functions';

interface FeedbackModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function FeedbackModal({ isOpen, onClose }: FeedbackModalProps) {
  const { username, isLoggedIn } = useCurrentUser();
  const [category, setCategory] = useState<FeedbackCategory | ''>('');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [screenshot, setScreenshot] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [issueUrl, setIssueUrl] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function clearScreenshot() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setScreenshot(null);
    setPreviewUrl(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  function reset() {
    setCategory('');
    setTitle('');
    setBody('');
    clearScreenshot();
    setSubmitting(false);
    setError(null);
    setIssueUrl(null);
    setSent(false);
  }

  function handleClose() {
    reset();
    onClose();
  }

  function handleScreenshotChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      clearScreenshot();
      return;
    }
    const problem = validateFeedbackScreenshotFile(file);
    if (problem) {
      setError(problem);
      clearScreenshot();
      return;
    }
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setError(null);
    setScreenshot(file);
    setPreviewUrl(URL.createObjectURL(file));
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

    let screenshotUrl: string | null = null;
    if (screenshot) {
      if (!isLoggedIn || !username) {
        setSubmitting(false);
        setError('Sign in to attach a screenshot.');
        return;
      }
      const problem = validateFeedbackScreenshotFile(screenshot);
      if (problem) {
        setSubmitting(false);
        setError(problem);
        return;
      }
      try {
        screenshotUrl = await uploadImageWithKeychain(screenshot, username);
      } catch {
        setSubmitting(false);
        setError("We couldn't upload that screenshot. Please try again, or send the note without it.");
        return;
      }
    }

    const result = await submitFeedback({
      title: nextTitle,
      body: nextBody,
      category,
      pageUrl: window.location.href,
      chatToken: readChatSessionToken(),
      screenshotUrl,
    });
    setSubmitting(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }
    setSent(true);
    setIssueUrl(result.url);
  }

  const canAttachScreenshot = Boolean(isLoggedIn && username);

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
                {isLoggedIn && username
                  ? `Signed in as @${username}. We'll note that Hive username on what you send. We don't attach your email or IP.`
                  : "Bugs, ideas, or anything that felt off. If you're signed in we note your Hive username. Guests can send this too. We don't attach your email or IP."}
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

              {canAttachScreenshot && (
                <FormControl>
                  <FormLabel fontSize="sm" color="text">Screenshot (optional)</FormLabel>
                  <Input
                    ref={fileInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    onChange={handleScreenshotChange}
                    aria-label="Screenshot"
                    border="none"
                    px={0}
                    h="auto"
                  />
                  <FormHelperText>
                    PNG, JPEG, or WebP, up to 5 MB. Uploaded with your Hive account to the usual image host, then linked on the issue.
                  </FormHelperText>
                  {previewUrl && screenshot && (
                    <VStack align="stretch" spacing={2} mt={3}>
                      <Image
                        src={previewUrl}
                        alt="Screenshot preview"
                        maxW="100%"
                        maxH="160px"
                        objectFit="contain"
                        borderRadius="8px"
                      />
                      <Button size="sm" variant="ghost" alignSelf="flex-start" onClick={clearScreenshot}>
                        Remove screenshot
                      </Button>
                    </VStack>
                  )}
                </FormControl>
              )}

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
