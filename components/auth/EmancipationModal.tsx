'use client'
import { useEffect, useState } from 'react'
import {
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  ModalCloseButton,
  Button,
  Text,
  Box,
  Code,
  VStack,
  Alert,
  AlertIcon,
  AlertDescription,
  useToast,
  Spinner,
  Divider,
} from '@chakra-ui/react'
import { getEmancipationStatus, startEmancipation } from '@/lib/snapie-auth/client'

interface EmancipationModalProps {
  isOpen: boolean
  onClose: () => void
}

type Step = 'info' | 'confirm' | 'keys' | 'loading'

interface Keys {
  owner: string
  active: string
  posting: string
  memo: string
}

export default function EmancipationModal({ isOpen, onClose }: EmancipationModalProps) {
  const [step, setStep] = useState<Step>('info')
  const [totalUsd, setTotalUsd] = useState<number | null>(null)
  const [thresholdUsd, setThresholdUsd] = useState<number | null>(null)
  const [keys, setKeys] = useState<Keys | null>(null)
  const [statusLoading, setStatusLoading] = useState(false)
  const toast = useToast()

  const fetchStatus = async () => {
    setStatusLoading(true)
    try {
      const { totalUsd: t, thresholdUsd: th } = await getEmancipationStatus()
      setTotalUsd(t)
      setThresholdUsd(th)
    } catch {
      // non-fatal — proceed anyway
    } finally {
      setStatusLoading(false)
    }
  }

  useEffect(() => {
    if (isOpen) {
      setStep('info')
      setKeys(null)
      fetchStatus()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen])

  const handleExport = async () => {
    setStep('loading')
    try {
      const { keys: k } = await startEmancipation()
      setKeys(k)
      setStep('keys')
    } catch (err: any) {
      toast({
        title: 'Export failed',
        description: err?.message ?? 'Could not export keys. Try again.',
        status: 'error',
        duration: 5000,
        isClosable: true,
      })
      setStep('confirm')
    }
  }

  const copyKey = (label: string, value: string) => {
    navigator.clipboard.writeText(value).then(() => {
      toast({ title: `${label} key copied`, status: 'success', duration: 2000 })
    })
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="lg"
      closeOnOverlayClick={step !== 'loading'}
    >
      <ModalOverlay />
      <ModalContent>
        {step === 'info' && (
          <>
            <ModalHeader>Export your Hive keys</ModalHeader>
            <ModalCloseButton />
            <ModalBody>
              <VStack align="start" spacing={4}>
                {statusLoading ? (
                  <Spinner size="sm" />
                ) : totalUsd !== null && thresholdUsd !== null ? (
                  <Alert status="warning" borderRadius="md">
                    <AlertIcon />
                    <AlertDescription fontSize="sm">
                      Your account value is <strong>${totalUsd.toFixed(2)}</strong>, above the{' '}
                      <strong>${thresholdUsd.toFixed(2)}</strong> self-custody threshold.
                    </AlertDescription>
                  </Alert>
                ) : null}
                <Text fontSize="sm">
                  Your account is currently managed by Snapie (custodial mode). Exporting your keys
                  lets you take full ownership — you&apos;ll be able to sign transactions yourself
                  using Keychain, HiveAuth, or any other wallet.
                </Text>
                <Text fontSize="sm" fontWeight="bold">
                  What happens when you export:
                </Text>
                <VStack align="start" spacing={1} pl={3}>
                  <Text fontSize="sm">• Your four Hive keys will be shown <strong>once</strong>.</Text>
                  <Text fontSize="sm">• Save them securely — they cannot be shown again.</Text>
                  <Text fontSize="sm">• Snapie will stop managing your keys.</Text>
                  <Text fontSize="sm">• You keep full access to your account and content.</Text>
                </VStack>
              </VStack>
            </ModalBody>
            <ModalFooter>
              <Button variant="ghost" mr={3} onClick={onClose}>Cancel</Button>
              <Button colorScheme="orange" onClick={() => setStep('confirm')}>
                I understand, continue →
              </Button>
            </ModalFooter>
          </>
        )}

        {step === 'confirm' && (
          <>
            <ModalHeader>Are you sure?</ModalHeader>
            <ModalCloseButton />
            <ModalBody>
              <Alert status="error" borderRadius="md">
                <AlertIcon />
                <AlertDescription fontSize="sm">
                  This action is <strong>irreversible</strong>. Your keys will be shown exactly once.
                  If you lose them, you lose access to your account permanently.
                </AlertDescription>
              </Alert>
              <Text fontSize="sm" mt={4}>
                Have a password manager or secure note ready before proceeding.
              </Text>
            </ModalBody>
            <ModalFooter>
              <Button variant="ghost" mr={3} onClick={() => setStep('info')}>Back</Button>
              <Button colorScheme="red" onClick={handleExport}>
                Export keys now
              </Button>
            </ModalFooter>
          </>
        )}

        {step === 'loading' && (
          <>
            <ModalHeader>Exporting keys…</ModalHeader>
            <ModalBody>
              <VStack py={8} spacing={4}>
                <Spinner size="lg" />
                <Text fontSize="sm" color="overlay.500">Generating key export…</Text>
              </VStack>
            </ModalBody>
          </>
        )}

        {step === 'keys' && keys && (
          <>
            <ModalHeader>Your Hive keys</ModalHeader>
            <ModalBody>
              <Alert status="warning" borderRadius="md" mb={4}>
                <AlertIcon />
                <AlertDescription fontSize="sm">
                  Save all four keys now. This screen will not appear again.
                </AlertDescription>
              </Alert>
              <VStack align="start" spacing={3}>
                {(['owner', 'active', 'posting', 'memo'] as const).map((k) => (
                  <Box key={k} w="100%">
                    <Text fontSize="xs" fontWeight="bold" textTransform="uppercase" mb={1} color="overlay.500">
                      {k} key
                    </Text>
                    <Box display="flex" alignItems="center" gap={2}>
                      <Code fontSize="xs" p={2} borderRadius="md" flex={1} overflowX="auto" userSelect="all">
                        {keys[k]}
                      </Code>
                      <Button size="xs" variant="outline" onClick={() => copyKey(k, keys[k])}>
                        Copy
                      </Button>
                    </Box>
                    {k !== 'memo' && <Divider mt={3} />}
                  </Box>
                ))}
              </VStack>
            </ModalBody>
            <ModalFooter>
              <Button colorScheme="green" onClick={onClose}>
                I&apos;ve saved my keys — done
              </Button>
            </ModalFooter>
          </>
        )}
      </ModalContent>
    </Modal>
  )
}
