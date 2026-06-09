'use client'
import { useEffect, useState } from 'react'
import {
  Alert,
  AlertIcon,
  AlertTitle,
  AlertDescription,
  Button,
  CloseButton,
  Flex,
  Text,
  useDisclosure,
} from '@chakra-ui/react'
import { useSnapieAuth } from '@/contexts/SnapieAuthContext'
import { getEmancipationStatus } from '@/lib/snapie-auth/client'
import dynamic from 'next/dynamic'

const EmancipationModal = dynamic(() => import('./EmancipationModal'), { ssr: false })

const DISMISS_KEY = 'snapie_emancipation_dismissed_v1'

export default function EmancipationBanner() {
  const { isSnapieLoggedIn, emancipationRequired } = useSnapieAuth()
  const { isOpen: isBannerOpen, onClose: closeBanner, onOpen: openBanner } = useDisclosure()
  const { isOpen: isModalOpen, onClose: closeModal, onOpen: openModal } = useDisclosure()
  const [totalUsd, setTotalUsd] = useState<number | null>(null)
  const [thresholdUsd, setThresholdUsd] = useState<number | null>(null)

  // Show banner when emancipation is required, unless dismissed this session
  useEffect(() => {
    if (!isSnapieLoggedIn || !emancipationRequired) return
    const dismissed = sessionStorage.getItem(DISMISS_KEY)
    if (!dismissed) openBanner()
  }, [isSnapieLoggedIn, emancipationRequired, openBanner])

  // Re-open on post-transaction signal (dispatched by Snapie active-key interceptors)
  useEffect(() => {
    const handler = () => {
      sessionStorage.removeItem(DISMISS_KEY)
      openBanner()
    }
    window.addEventListener('snapie:emancipation-required', handler)
    return () => window.removeEventListener('snapie:emancipation-required', handler)
  }, [openBanner])

  // Fetch detailed status when banner is visible
  useEffect(() => {
    if (!isBannerOpen) return
    getEmancipationStatus()
      .then(({ totalUsd: t, thresholdUsd: th }) => {
        setTotalUsd(t)
        setThresholdUsd(th)
      })
      .catch(() => {})
  }, [isBannerOpen])

  const handleDismiss = () => {
    sessionStorage.setItem(DISMISS_KEY, '1')
    closeBanner()
  }

  if (!isBannerOpen) return null

  return (
    <>
      <Alert
        status="warning"
        variant="left-accent"
        px={4}
        py={3}
        alignItems="flex-start"
        flexShrink={0}
      >
        <AlertIcon mt={0.5} />
        <Flex direction="column" flex={1} gap={1}>
          <AlertTitle fontSize="sm">Your account has grown — consider securing your keys</AlertTitle>
          <AlertDescription fontSize="xs">
            {totalUsd !== null && thresholdUsd !== null ? (
              <Text>
                Your account value is <strong>${totalUsd.toFixed(2)}</strong>, above the{' '}
                <strong>${thresholdUsd.toFixed(2)}</strong> self-custody threshold. Export your keys
                to take full ownership of your Hive account.
              </Text>
            ) : (
              <Text>
                Your account value has exceeded our recommended self-custody threshold. Export your
                keys to take full ownership of your Hive account.
              </Text>
            )}
          </AlertDescription>
          <Button
            mt={2}
            size="xs"
            colorScheme="orange"
            variant="solid"
            alignSelf="flex-start"
            onClick={openModal}
          >
            Export my keys →
          </Button>
        </Flex>
        <CloseButton
          alignSelf="flex-start"
          size="sm"
          onClick={handleDismiss}
          title="Dismiss (until next transaction)"
        />
      </Alert>
      <EmancipationModal isOpen={isModalOpen} onClose={closeModal} />
    </>
  )
}
