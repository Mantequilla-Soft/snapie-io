'use client'
import { useEffect } from 'react'
import { useToast, Button } from '@chakra-ui/react'
import { useLoginModal } from '@/contexts/LoginModalContext'
import type { NeedsWalletKeyType } from '@/lib/hive/signing'

const COPY: Record<NeedsWalletKeyType | 'unknown', { title: string; body: string }> = {
  posting: {
    title: 'Posting key required',
    body: 'Your keys are self-custodied. Tap to connect your Hive wallet with your posting key and retry.',
  },
  active: {
    title: 'Active key required',
    body: 'Your keys are self-custodied. Tap to connect your Hive wallet with your active key and retry.',
  },
  unknown: {
    title: 'Wallet signature required',
    body: 'Your keys are self-custodied. Tap to connect your Hive wallet and retry.',
  },
}

/**
 * Invisible component that listens for `snapie:needs-wallet` events dispatched
 * when an emancipated Snapie user attempts an operation the server can no
 * longer sign custodially. Surfaces a toast explaining what happened and
 * offers a direct path to connect their Hive wallet (Keychain, HiveAuth, etc.).
 */
export default function NeedsWalletHandler() {
  const toast = useToast()
  const { openLoginModalToWallets } = useLoginModal()

  useEffect(() => {
    const handler = (e: Event) => {
      const keyType = (e as CustomEvent<{ keyType?: NeedsWalletKeyType }>).detail?.keyType
      const { title, body } = COPY[keyType ?? 'unknown']
      toast.closeAll()
      toast({
        title,
        description: body,
        status: 'warning',
        duration: null,
        isClosable: true,
        position: 'top',
        render: ({ onClose }) => (
          <Button
            display="flex"
            flexDirection="column"
            alignItems="flex-start"
            bg="orange.600"
            color="white"
            px={4}
            py={3}
            borderRadius="md"
            gap={1}
            onClick={() => { onClose(); openLoginModalToWallets() }}
            _hover={{ bg: 'orange.500' }}
            width="auto"
            height="auto"
            whiteSpace="normal"
            textAlign="left"
          >
            <strong style={{ fontSize: '0.9rem' }}>{title}</strong>
            <span style={{ fontSize: '0.8rem', fontWeight: 'normal' }}>{body}</span>
          </Button>
        ),
      })
    }

    window.addEventListener('snapie:needs-wallet', handler)
    return () => window.removeEventListener('snapie:needs-wallet', handler)
  }, [toast, openLoginModalToWallets])

  return null
}
