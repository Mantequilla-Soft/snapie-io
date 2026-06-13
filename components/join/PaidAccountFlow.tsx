'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Alert,
  AlertIcon,
  Badge,
  Box,
  Button,
  Code,
  HStack,
  Spinner,
  Text,
  VStack,
} from '@chakra-ui/react'
import QRCode from 'react-qr-code'
import {
  createHiveIntent,
  createLightningIntent,
  getPaymentFee,
  pollPaymentIntent,
} from '@/lib/snapie-auth/client'
import type {
  HiveIntentResponse,
  LightningIntentResponse,
  PaymentFeeResponse,
} from '@/lib/snapie-auth/types'

type Step = 'choose' | 'hive' | 'lightning'

interface Props {
  onConfirmed: () => void
  onCancel: () => void
}

export default function PaidAccountFlow({ onConfirmed, onCancel }: Props) {
  const [fee, setFee] = useState<PaymentFeeResponse | null>(null)
  const [feeError, setFeeError] = useState(false)
  const [step, setStep] = useState<Step>('choose')
  const [hiveIntent, setHiveIntent] = useState<HiveIntentResponse | null>(null)
  const [lightningIntent, setLightningIntent] = useState<LightningIntentResponse | null>(null)
  const [expired, setExpired] = useState(false)
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState('')
  const [secsLeft, setSecsLeft] = useState<number | null>(null)
  const [copiedField, setCopiedField] = useState<string | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const pollInFlightRef = useRef(false)

  useEffect(() => {
    getPaymentFee().then(setFee).catch(() => setFeeError(true))
  }, [])

  const expiresAt = hiveIntent?.expiresAt ?? lightningIntent?.expiresAt
  const memo = hiveIntent?.memo ?? lightningIntent?.memo

  // Countdown timer
  useEffect(() => {
    if (!expiresAt) return
    const tick = () =>
      setSecsLeft(Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000)))
    tick()
    timerRef.current = setInterval(tick, 1000)
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [expiresAt])

  // Payment polling
  useEffect(() => {
    if (!memo) return
    pollRef.current = setInterval(async () => {
      if (pollInFlightRef.current) return
      pollInFlightRef.current = true
      try {
        const result = await pollPaymentIntent(memo)
        if (result.status === 'confirmed') {
          clearInterval(pollRef.current!)
          onConfirmed()
        } else if (result.status === 'expired') {
          clearInterval(pollRef.current!)
          setExpired(true)
        }
      } catch {
        // ignore transient errors
      } finally {
        pollInFlightRef.current = false
      }
    }, 4000)
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [memo, onConfirmed])

  const goHive = useCallback(async () => {
    setCreating(true)
    setCreateError('')
    try {
      const intent = await createHiveIntent()
      setHiveIntent(intent)
      setStep('hive')
    } catch {
      setCreateError('Could not create payment request. Please try again.')
    } finally {
      setCreating(false)
    }
  }, [])

  const goLightning = useCallback(async () => {
    setCreating(true)
    setCreateError('')
    try {
      const intent = await createLightningIntent()
      setLightningIntent(intent)
      setStep('lightning')
    } catch {
      setCreateError('Could not create payment request. Please try again.')
    } finally {
      setCreating(false)
    }
  }, [])

  const copy = useCallback((text: string, field: string) => {
    navigator.clipboard.writeText(text)
      .then(() => {
        setCopiedField(field)
        setTimeout(() => setCopiedField(null), 2000)
      })
      .catch(() => {
        setCreateError('Clipboard access failed. Please copy manually.')
      })
  }, [])

  const reset = useCallback(() => {
    if (pollRef.current) clearInterval(pollRef.current)
    if (timerRef.current) clearInterval(timerRef.current)
    setStep('choose')
    setHiveIntent(null)
    setLightningIntent(null)
    setExpired(false)
    setSecsLeft(null)
  }, [])

  const countdown =
    secsLeft !== null
      ? `${Math.floor(secsLeft / 60).toString().padStart(2, '0')}:${(secsLeft % 60).toString().padStart(2, '0')}`
      : null

  if (feeError) {
    return (
      <Alert status="error" borderRadius="md">
        <AlertIcon />
        <Text fontSize="sm">Could not load account fee. Please refresh and try again.</Text>
      </Alert>
    )
  }

  if (!fee) {
    return (
      <HStack justify="center" py={2}>
        <Spinner size="sm" />
        <Text fontSize="sm" color="gray.500">Loading fee…</Text>
      </HStack>
    )
  }

  if (expired) {
    return (
      <Alert status="warning" borderRadius="md">
        <AlertIcon />
        <VStack align="start" spacing={1} flex={1}>
          <Text fontSize="sm">Payment window expired.</Text>
          <Button size="xs" variant="link" colorScheme="orange" onClick={reset}>
            Try again
          </Button>
        </VStack>
      </Alert>
    )
  }

  if (step === 'choose') {
    return (
      <VStack spacing={3} align="stretch">
        <Box>
          <Text fontSize="sm" fontWeight="semibold">Pay for your account</Text>
          <Text fontSize="xs" color="gray.500" mt={0.5}>
            Current fee: <strong>{fee.amountHive}</strong> (≈${fee.amountUsd.toFixed(2)} USD)
          </Text>
        </Box>
        {createError && (
          <Alert status="error" borderRadius="md" py={2}>
            <AlertIcon />
            <Text fontSize="xs">{createError}</Text>
          </Alert>
        )}
        <HStack spacing={3}>
          <Button flex={1} variant="outline" colorScheme="orange" isLoading={creating} onClick={goHive}>
            Pay with HIVE
          </Button>
          <Button flex={1} variant="outline" colorScheme="yellow" isLoading={creating} onClick={goLightning}>
            ⚡ Lightning
          </Button>
        </HStack>
        <Button variant="ghost" size="xs" color="gray.400" onClick={onCancel}>
          Cancel
        </Button>
      </VStack>
    )
  }

  const expiryBadge = countdown ? (
    <Badge colorScheme={secsLeft! < 300 ? 'red' : 'gray'} fontSize="xs" fontFamily="mono">
      {countdown}
    </Badge>
  ) : null

  const pollSpinner = (
    <HStack spacing={2} color="gray.400">
      <Spinner size="xs" />
      <Text fontSize="xs">Watching for payment…</Text>
    </HStack>
  )

  if (step === 'hive' && hiveIntent) {
    const fields = [
      { label: 'To', value: hiveIntent.receivingAccount, field: 'account' },
      { label: 'Amount', value: hiveIntent.amount, field: 'amount' },
      { label: 'Memo', value: hiveIntent.memo, field: 'memo' },
    ]
    return (
      <VStack spacing={3} align="stretch">
        <HStack justify="space-between">
          <Text fontSize="sm" fontWeight="semibold">Send HIVE transfer</Text>
          {expiryBadge}
        </HStack>
        <Text fontSize="xs" color="gray.500">
          Send exactly this amount with the memo. The memo links the payment to your session.
        </Text>
        {fields.map(({ label, value, field }) => (
          <Box key={field}>
            <Text fontSize="xs" color="gray.500" mb={1}>{label}</Text>
            <HStack>
              <Code flex={1} fontSize="sm" px={2} py={1} borderRadius="md" wordBreak="break-all">
                {value}
              </Code>
              <Button size="xs" variant="outline" minW="60px" onClick={() => copy(value, field)}>
                {copiedField === field ? '✓ Done' : 'Copy'}
              </Button>
            </HStack>
          </Box>
        ))}
        {pollSpinner}
        <Button variant="ghost" size="xs" color="gray.400" onClick={reset}>
          ← Different payment method
        </Button>
      </VStack>
    )
  }

  if (step === 'lightning' && lightningIntent) {
    return (
      <VStack spacing={3} align="stretch">
        <HStack justify="space-between">
          <Text fontSize="sm" fontWeight="semibold">⚡ Lightning invoice</Text>
          {expiryBadge}
        </HStack>
        <Text fontSize="xs" color="gray.500">
          Scan with any Lightning wallet. Amount: ≈${lightningIntent.amountUsd.toFixed(2)} USD.
        </Text>
        <Box bg="white" p={3} borderRadius="lg" alignSelf="center">
          <QRCode value={lightningIntent.invoice} size={176} />
        </Box>
        <HStack>
          <Code flex={1} fontSize="xs" px={2} py={1} borderRadius="md" noOfLines={2} wordBreak="break-all">
            {lightningIntent.invoice}
          </Code>
          <Button size="xs" variant="outline" minW="60px" onClick={() => copy(lightningIntent.invoice, 'invoice')}>
            {copiedField === 'invoice' ? '✓ Done' : 'Copy'}
          </Button>
        </HStack>
        {pollSpinner}
        <Button variant="ghost" size="xs" color="gray.400" onClick={reset}>
          ← Different payment method
        </Button>
      </VStack>
    )
  }

  return null
}
