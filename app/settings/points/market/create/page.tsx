'use client';
import {
  Box, Heading, Text, VStack, FormControl, FormLabel, Input, Textarea, NumberInput, NumberInputField,
  Button, Image, Progress, Link as ChakraLink, useToast,
} from '@chakra-ui/react';
import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import NextLink from 'next/link';
import { FiArrowLeft } from 'react-icons/fi';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useLoginModal } from '@/contexts/LoginModalContext';
import { usePointsSummary } from '@/hooks/usePointsSummary';
import { uploadImageWithKeychain } from '@/lib/hive/client-functions';
import { createMarketItem } from '@/lib/points/marketClient';
import { ITEM_CREATION_FEE, ITEM_MIN_PRICE } from '@/lib/points/marketConfig';
import { notEnoughPointsToast } from '@/components/shared/NotEnoughPointsToast';

export default function CreateItemPage() {
  const { username, isLoggedIn } = useCurrentUser();
  const { openLoginModal } = useLoginModal();
  const points = usePointsSummary(username);
  const toast = useToast();
  const router = useRouter();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [imageUrl, setImageUrl] = useState('');
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState(ITEM_MIN_PRICE);
  const [submitting, setSubmitting] = useState(false);

  if (!isLoggedIn || !username) {
    return (
      <Box maxW="480px" mx="auto" px={6} py={16} textAlign="center">
        <Text color="overlay.500" mb={4}>Log in to create an item.</Text>
        <Button colorScheme="blue" onClick={openLoginModal}>Log in</Button>
      </Box>
    );
  }

  async function handleImageFile(file: File) {
    setUploadProgress(0);
    try {
      const url = await uploadImageWithKeychain(file, username!, { onProgress: setUploadProgress });
      setImageUrl(url);
    } catch (err: unknown) {
      toast({ status: 'error', title: 'Upload failed', description: err instanceof Error ? err.message : undefined });
    } finally {
      setUploadProgress(null);
    }
  }

  async function handleSubmit() {
    if (!username) return;
    if (!name.trim() || !description.trim() || !imageUrl || price < ITEM_MIN_PRICE) {
      toast({ status: 'warning', title: 'Fill in everything first', description: `Name, description, an image, and a price of at least ${ITEM_MIN_PRICE}.` });
      return;
    }
    setSubmitting(true);
    try {
      const result = await createMarketItem(username, { name: name.trim(), description: description.trim(), imageUrl, price });
      if (result.status === 'submitted') {
        toast({
          status: 'success',
          title: 'Submitted for review!',
          description: `${ITEM_CREATION_FEE} points spent — you'll see it in the shop once an admin approves it.`,
          duration: 6000,
        });
        router.push('/settings/points/market');
      } else if (result.status === 'capped') {
        toast({ status: 'warning', title: "You've hit today's submission limit", description: 'Try again tomorrow.' });
      } else {
        toast(notEnoughPointsToast(ITEM_CREATION_FEE, 'Creating an item'));
      }
    } catch (err: any) {
      toast({ status: 'error', title: 'Submission failed', description: err?.message });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Box maxW="480px" mx="auto" px={{ base: 4, md: 8 }} py={10}>
      <ChakraLink as={NextLink} href="/settings/points/market" display="inline-flex" alignItems="center" gap={1} color="overlay.500" fontSize="sm" mb={4} _hover={{ color: 'text' }}>
        <FiArrowLeft /> The Pile
      </ChakraLink>

      <Heading size="lg" fontWeight="bold" color="text" mb={1}>
        Create an Item
      </Heading>
      <Text color="overlay.500" fontSize="sm" mb={1}>
        Make something silly, submit it for review. Costs {ITEM_CREATION_FEE} points to try — win or lose, that part&apos;s not refundable.
      </Text>
      <Text color="overlay.400" fontSize="xs" mb={6}>
        Current balance: {points ? points.balance.toLocaleString() : '—'} points
      </Text>

      <VStack spacing={5} align="stretch">
        <FormControl>
          <FormLabel fontSize="sm" color="overlay.500">Image</FormLabel>
          <Box
            border="1px dashed"
            borderColor="surfaceBorder"
            borderRadius="12px"
            p={4}
            textAlign="center"
            cursor="pointer"
            onClick={() => fileInputRef.current?.click()}
          >
            {imageUrl ? (
              <Image src={imageUrl} alt="Item preview" boxSize="100px" objectFit="contain" mx="auto" />
            ) : (
              <Text color="overlay.400" fontSize="sm">Tap to upload an image</Text>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              style={{ display: 'none' }}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleImageFile(file);
                e.target.value = '';
              }}
            />
          </Box>
          {uploadProgress !== null && <Progress value={uploadProgress} size="xs" colorScheme="blue" borderRadius="full" mt={2} />}
        </FormControl>

        <FormControl>
          <FormLabel fontSize="sm" color="overlay.500">Name</FormLabel>
          <Input value={name} onChange={(e) => setName(e.target.value.slice(0, 60))} placeholder="Bitten Cookie" maxLength={60} />
        </FormControl>

        <FormControl>
          <FormLabel fontSize="sm" color="overlay.500">Description</FormLabel>
          <Textarea value={description} onChange={(e) => setDescription(e.target.value.slice(0, 280))} placeholder="What is this thing, and why would someone throw it at a post?" maxLength={280} rows={3} />
        </FormControl>

        <FormControl>
          <FormLabel fontSize="sm" color="overlay.500">Price (points)</FormLabel>
          <NumberInput value={price} min={ITEM_MIN_PRICE} onChange={(_, val) => setPrice(Number.isFinite(val) ? val : ITEM_MIN_PRICE)}>
            <NumberInputField />
          </NumberInput>
        </FormControl>

        <Button colorScheme="blue" onClick={handleSubmit} isLoading={submitting}>
          Submit for review ({ITEM_CREATION_FEE} points)
        </Button>

        <Text fontSize="xs" color="overlay.400">
          An admin reviews every item before it shows up in the shop. If it&apos;s rejected, the {ITEM_CREATION_FEE}-point fee is not refunded.
        </Text>
      </VStack>
    </Box>
  );
}
