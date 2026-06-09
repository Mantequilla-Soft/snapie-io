'use client'
import { useEffect } from 'react'
import { useToast, Button } from '@chakra-ui/react'
import { useLoginModal } from '@/contexts/LoginModalContext'

/**
 * Invisible component that listens for `snapie:needs-wallet` events dispatched
 * when an emancipated Snapie user attempts an active-key operation.
 * Surfaces a toast explaining what happened and offers a direct path to connect
 * their Hive wallet (Keychain, HiveAuth, etc.).
 */
export default function NeedsWalletHandler() {
  const toast = useToast()
  const { openLoginModalToWallets } = useLoginModal()

  useEffect(() => {
    const handler = () => {
      toast.closeAll()
      toast({
        title: 'Active key required',
        description: 'Your keys are self-custodied. Connect your Hive wallet (Keychain, HiveAuth) to sign this action.',
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
            <strong style={{ fontSize: '0.9rem' }}>Active key required</strong>
            <span style={{ fontSize: '0.8rem', fontWeight: 'normal' }}>
              Your keys are self-custodied. Tap to connect your Hive wallet and retry.
            </span>
          </Button>
        ),
      })
    }

    window.addEventListener('snapie:needs-wallet', handler)
    return () => window.removeEventListener('snapie:needs-wallet', handler)
  }, [toast, openLoginModalToWallets])

  return null
}
