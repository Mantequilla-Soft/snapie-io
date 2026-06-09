'use client'

import { Suspense } from 'react'
import { Box, Button, Divider, Heading, Spinner, Text, VStack } from '@chakra-ui/react'
import { useSearchParams, useRouter } from 'next/navigation'
import SponsorFlow from '@/components/join/SponsorFlow'
import QuotaWidget from '@/components/join/QuotaWidget'
import { useLoginModal } from '@/contexts/LoginModalContext'

function JoinPageInner() {
  const searchParams = useSearchParams()
  const code = searchParams.get('code')
  const { openLoginModal } = useLoginModal()

  // Existing sponsor-link flow: /join?code=... shows the sponsor redemption UI.
  if (code) return <SponsorFlow code={code} />

  return (
    <Box maxW="520px" mx="auto" px={4} py={12}>
      <VStack spacing={8} align="stretch">
        {/* Header */}
        <VStack spacing={2} align="center">
          <Heading size="lg">Get your Hive account</Heading>
          <Text color="gray.500" fontSize="sm" textAlign="center">
            Hive is a decentralised social blockchain. Your account is your passport to Snapie and the
            entire Hive ecosystem.
          </Text>
          <QuotaWidget />
        </VStack>

        {/* Path A — Quick Join */}
        <Box
          borderWidth={2}
          borderColor="blue.400"
          borderRadius="xl"
          p={6}
          position="relative"
        >
          <Box
            position="absolute"
            top="-12px"
            left={4}
            bg="blue.400"
            color="white"
            fontSize="xs"
            fontWeight="bold"
            px={3}
            py={1}
            borderRadius="full"
          >
            Easiest
          </Box>
          <VStack spacing={3} align="stretch">
            <Heading size="sm">Quick Join</Heading>
            <Text fontSize="sm" color="gray.500">
              Sign up with Google or email — we create your Hive account automatically. No keys,
              no setup. You can export your keys any time.
            </Text>
            <Button colorScheme="blue" size="lg" onClick={openLoginModal} borderRadius="lg">
              Get started →
            </Button>
          </VStack>
        </Box>

        {/* Path B — Sponsor Link */}
        <Box borderWidth={1} borderRadius="xl" p={6}>
          <VStack spacing={3} align="stretch">
            <Heading size="sm">Got a sponsor link?</Heading>
            <Text fontSize="sm" color="gray.500">
              If someone sent you a link or QR code, paste the URL here or click the link directly.
              Sponsor tokens bypass the daily quota.
            </Text>
            <Button
              variant="outline"
              size="md"
              onClick={() => {
                const link = prompt('Paste your sponsor link here:')
                if (!link) return
                try {
                  const url = new URL(link)
                  const c = url.searchParams.get('code')
                  if (c) window.location.href = `/join?code=${encodeURIComponent(c)}`
                  else alert('That link does not look like a valid sponsor link.')
                } catch {
                  alert('Invalid URL. Please paste the full link.')
                }
              }}
            >
              Redeem sponsor link
            </Button>
          </VStack>
        </Box>

        <Divider />

        {/* Path C — Already on Hive */}
        <VStack spacing={2} align="center">
          <Text fontSize="sm" color="gray.500">
            Already have a Hive account?
          </Text>
          <Button variant="link" colorScheme="blue" size="sm" onClick={openLoginModal}>
            Sign in with your Hive wallet →
          </Button>
        </VStack>
      </VStack>
    </Box>
  )
}

export default function JoinPage() {
  return (
    <Suspense fallback={<Box display="flex" justifyContent="center" py={16}><Spinner /></Box>}>
      <JoinPageInner />
    </Suspense>
  )
}
