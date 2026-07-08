'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Alert,
  AlertIcon,
  Box,
  Button,
  Divider,
  FormControl,
  FormErrorMessage,
  FormLabel,
  Input,
  Progress,
  Text,
  VStack,
} from '@chakra-ui/react'
import {
  checkUsername,
  createAccount,
  getEligibility,
  getMe,
  pollJob,
} from '@/lib/snapie-auth/client'
import { SnapieAuthError } from '@/lib/snapie-auth/types'
import { validateAccountName } from '@/lib/hive/account-create-client'
import type { SnapieUser } from '@/lib/snapie-auth/types'
import PaidAccountFlow from '@/components/join/PaidAccountFlow'

// Quota errors where paying bypasses the restriction.
// previously_had_account is intentionally excluded — one email, one account, no exceptions.
const PAYABLE_REASONS = new Set(['global_daily_limit', 'ip_daily_limit'])

const JOB_STATUS_LABEL: Record<string, string> = {
  pending: 'Queued…',
  broadcasting: 'Broadcasting to Hive…',
  acked: 'Transaction acknowledged…',
  confirmed: 'Account confirmed!',
  failed: 'Account creation failed.',
  expired: 'Request expired.',
}

const RC_ERROR_MSG =
  'The account creation service is temporarily out of resource credits. ' +
  'Please try again in a few minutes.'

const ERROR_MESSAGES: Record<string, string> = {
  global_daily_limit: "We've hit today's free-account limit. Try again tomorrow, or use a sponsor link.",
  ip_daily_limit: "You've reached the daily limit from your network. Try again tomorrow.",
  previously_had_account: "This email was already used for a free account. Use a sponsor link to get another.",
  no_acts: "Account provisioning is temporarily unavailable. Please try again later.",
  insufficient_rc: RC_ERROR_MSG,
}

interface Props {
  onComplete: (user: SnapieUser) => void
}

export default function AccountSetupPanel({ onComplete }: Props) {
  const [username, setUsername] = useState('')
  const [usernameError, setUsernameError] = useState('')
  const [checking, setChecking] = useState(false)
  const [available, setAvailable] = useState<boolean | null>(null)
  const [eligibility, setEligibility] = useState<{
    canCreate: boolean
    reason?: string
    sponsored?: boolean
  } | null>(null)
  const [eligibilityError, setEligibilityError] = useState('')
  const [paymentRequired, setPaymentRequired] = useState(false)
  const [paymentConfirmed, setPaymentConfirmed] = useState(false)
  const [showPaymentFlow, setShowPaymentFlow] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [jobStatus, setJobStatus] = useState<string | null>(null)
  const [submitError, setSubmitError] = useState('')
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const checkReqIdRef = useRef(0)

  useEffect(() => {
    getEligibility()
      .then((r) => {
        setEligibility(r)
        if (!r.canCreate && r.reason && PAYABLE_REASONS.has(r.reason) && !r.sponsored) {
          setPaymentRequired(true)
        }
      })
      .catch((e: SnapieAuthError) => {
        setEligibilityError(ERROR_MESSAGES[e.code] ?? 'Could not check eligibility.')
      })
  }, [])

  const handleUsernameChange = useCallback((val: string) => {
    const lower = val.toLowerCase().replace(/[^a-z0-9.-]/g, '')
    setUsername(lower)
    setAvailable(null)

    if (lower.length === 0) {
      setUsernameError('')
      return
    }
    const localErr = validateAccountName(lower)
    if (!localErr.isValid) {
      setUsernameError(localErr.error ?? 'Invalid username')
      return
    }
    setUsernameError('')

    if (debounceRef.current) clearTimeout(debounceRef.current)
    const reqId = ++checkReqIdRef.current
    debounceRef.current = setTimeout(async () => {
      setChecking(true)
      try {
        const res = await checkUsername(lower)
        if (reqId !== checkReqIdRef.current) return
        setAvailable(res.available)
        if (!res.available) setUsernameError(res.reason ?? 'Username not available.')
      } catch {
        if (reqId !== checkReqIdRef.current) return
        setUsernameError('Could not check availability.')
      } finally {
        if (reqId === checkReqIdRef.current) setChecking(false)
      }
    }, 500)
  }, [])

  const handleSubmit = useCallback(async () => {
    if (!available || usernameError || submitting) return
    setSubmitting(true)
    setSubmitError('')

    try {
      const { jobId } = await createAccount(username)
      setJobStatus('pending')

      let status = 'pending'
      const deadline = Date.now() + 120_000 // 2 min max
      while (!['confirmed', 'failed', 'expired'].includes(status)) {
        if (Date.now() > deadline) {
          setSubmitError('Account creation timed out. Please try again.')
          setSubmitting(false)
          setJobStatus(null)
          return
        }
        await new Promise((r) => setTimeout(r, 3000))
        const job = await pollJob(jobId)
        status = job.status
        setJobStatus(job.status)
        if (job.error) {
          setSubmitError(ERROR_MESSAGES[job.error] ?? `Error: ${job.error}`)
          setSubmitting(false)
          return
        }
      }

      if (status === 'confirmed') {
        const updated = await getMe()
        onComplete(updated)
      } else {
        setSubmitError('Account creation did not complete. Please try again.')
        setSubmitting(false)
      }
    } catch (e: any) {
      const code = e?.code ?? ''
      if (PAYABLE_REASONS.has(code) && !eligibility?.sponsored) {
        // Quota block — offer paid path instead of showing an error
        setPaymentRequired(true)
        setPaymentConfirmed(false)
        setShowPaymentFlow(true)
        setSubmitting(false)
        setJobStatus(null)
        return
      }
      setSubmitError(ERROR_MESSAGES[code] ?? 'Something went wrong. Please try again.')
      setSubmitting(false)
      setJobStatus(null)
    }
  }, [available, usernameError, submitting, username, onComplete, eligibility])

  const jobProgress: Record<string, number> = {
    pending: 20,
    broadcasting: 50,
    acked: 75,
    confirmed: 100,
  }

  if (eligibilityError) {
    return (
      <Alert status="warning" borderRadius="md">
        <AlertIcon />
        <Text fontSize="sm">{eligibilityError}</Text>
      </Alert>
    )
  }

  const canSubmit = available === true && !usernameError && !checking && !!username

  return (
    <VStack spacing={4} align="stretch">
      <Box>
        <Text fontWeight="semibold" fontSize="lg">
          Choose your Hive username
        </Text>
        <Text fontSize="sm" color="gray.500" mt={1}>
          This is your permanent on-chain identity. Choose wisely — it cannot be changed.
          {eligibility?.sponsored && (
            <Text as="span" color="green.500">
              {' '}
              You have a sponsor token — your account is free!
            </Text>
          )}
        </Text>
      </Box>

      <FormControl isInvalid={!!usernameError}>
        <FormLabel fontSize="sm">Username</FormLabel>
        <Input
          placeholder="e.g. alice"
          value={username}
          onChange={(e) => handleUsernameChange(e.target.value)}
          isDisabled={submitting || showPaymentFlow}
          autoComplete="off"
          autoCapitalize="none"
        />
        {usernameError ? (
          <FormErrorMessage>{usernameError}</FormErrorMessage>
        ) : available === true ? (
          <Text fontSize="xs" color="green.500" mt={1}>
            ✓ @{username} is available
          </Text>
        ) : checking ? (
          <Text fontSize="xs" color="overlay.500" mt={1}>
            Checking…
          </Text>
        ) : null}
      </FormControl>

      {submitError && (
        <Alert status="error" borderRadius="md">
          <AlertIcon />
          <Text fontSize="sm">{submitError}</Text>
        </Alert>
      )}

      {jobStatus && (
        <Box>
          <Text fontSize="sm" mb={2}>
            {JOB_STATUS_LABEL[jobStatus] ?? jobStatus}
          </Text>
          <Progress
            value={jobProgress[jobStatus] ?? 10}
            size="sm"
            borderRadius="full"
            colorScheme={jobStatus === 'confirmed' ? 'green' : 'blue'}
            isAnimated={!['confirmed', 'failed', 'expired'].includes(jobStatus)}
          />
        </Box>
      )}

      {!jobStatus && (
        <>
          {paymentRequired && !paymentConfirmed ? (
            showPaymentFlow ? (
              <>
                <Divider />
                <PaidAccountFlow
                  onConfirmed={() => {
                    setPaymentConfirmed(true)
                    setShowPaymentFlow(false)
                  }}
                  onCancel={() => setShowPaymentFlow(false)}
                />
              </>
            ) : (
              <VStack spacing={2} align="stretch">
                <Alert status="info" borderRadius="md">
                  <AlertIcon />
                  <Text fontSize="sm">
                    No free slots available today. You can pay to create your account instantly.
                  </Text>
                </Alert>
                <Button
                  colorScheme="orange"
                  onClick={() => setShowPaymentFlow(true)}
                  isDisabled={!canSubmit}
                  size="lg"
                  width="full"
                >
                  Pay for my account →
                </Button>
              </VStack>
            )
          ) : (
            <Button
              colorScheme={paymentConfirmed ? 'green' : 'blue'}
              onClick={handleSubmit}
              isLoading={submitting}
              isDisabled={!canSubmit}
              size="lg"
              width="full"
            >
              {paymentConfirmed ? 'Create my account (paid) →' : 'Create My Account'}
            </Button>
          )}
        </>
      )}
    </VStack>
  )
}
