'use client'

import { useEffect, useState } from 'react'
import {
  Box, Button, Divider, Heading, HStack, Input, InputGroup, InputRightAddon,
  Table, Tbody, Td, Text, Th, Thead, Tr, VStack, useToast,
} from '@chakra-ui/react'
import { useCurrentUser } from '@/hooks/useCurrentUser'
import { useLoginModal } from '@/contexts/LoginModalContext'
import { recurrentTransferWithAioha } from '@/lib/hive/aioha'
import { delegateWithKeychain, getCryptoPrices, witnessVoteWithKeychain } from '@/lib/hive/client-functions'
import useHiveAccount from '@/hooks/useHiveAccount'
import PatronBadge from '@/components/shared/PatronBadge'
import WitnessBadge from '@/components/shared/WitnessBadge'
import type { PatronTier } from '@/hooks/usePatronStatus'
import SupportersSection from '@/components/support/SupportersSection'

// Must match PATRON_MEMO_TAG in the activitytracker sidecar (see PATRONS_SPEC.md)
// — this is the substring the poller looks for to recognize a patron transfer.
const PATRON_MEMO_TAG = 'snapiepatron'
const PATRON_ACCOUNT = 'snapie'

// Monthly cadence: recurrence is in hours, executions is how many times it
// repeats. 64 is the max Hive allows — effectively "until cancelled" (~5
// years); cancel anytime by sending another recurrent_transfer for 0.
const RECURRENCE_HOURS = 24 * 30
const MAX_EXECUTIONS = 64

const SUBSCRIPTION_PRESETS: { tier: PatronTier; amount: number }[] = [
  { tier: 'snaperino', amount: 0.5 },
  { tier: 'snapian', amount: 2 },
  { tier: 'snap-master', amount: 5 },
]

// Delegation tiers are pegged to USD value, not a fixed HP number — HIVE's
// price swings far too much for a static HP threshold to mean the same
// thing for long (see PATRONS_SPEC.md for how the sidecar computes this).
// These are suggested USD amounts; the actual HP equivalent is computed
// live from the current market price below.
const DELEGATION_USD_PRESETS: { tier: PatronTier; usd: number }[] = [
  { tier: 'snaperino', usd: 15 },
  { tier: 'snapian', usd: 75 },
  { tier: 'snap-master', usd: 300 },
]

export default function SupportPage() {
  const { username, isLoggedIn, isSnapie } = useCurrentUser()
  const { openLoginModal } = useLoginModal()
  const toast = useToast()
  const { hiveAccount, refetch: refetchAccount } = useHiveAccount(username ?? '')

  const [subAmount, setSubAmount] = useState('2')
  const [delAmount, setDelAmount] = useState('')
  const [isSubmittingSub, setIsSubmittingSub] = useState(false)
  const [isSubmittingDel, setIsSubmittingDel] = useState(false)
  const [isSubmittingWitness, setIsSubmittingWitness] = useState(false)
  const [hivePriceUsd, setHivePriceUsd] = useState<number | null>(null)

  const hasVotedForWitness = hiveAccount?.witness_votes?.includes(PATRON_ACCOUNT) ?? false

  useEffect(() => {
    getCryptoPrices().then(({ hive }) => {
      if (hive > 0) setHivePriceUsd(hive)
    }).catch(() => {})
  }, [])

  const hpForUsd = (usd: number) => hivePriceUsd ? usd / hivePriceUsd : null

  useEffect(() => {
    // Once the price loads, default the delegate field to the "Snapian"
    // preset instead of leaving it blank.
    if (hivePriceUsd && !delAmount) {
      const hp = hpForUsd(75)
      if (hp) setDelAmount(String(Math.round(hp)))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hivePriceUsd])

  const handleSubscribe = async () => {
    if (!isLoggedIn) return openLoginModal()
    const amount = parseFloat(subAmount)
    if (!Number.isFinite(amount) || amount <= 0) {
      toast({ status: 'warning', title: 'Enter an amount greater than 0' })
      return
    }
    setIsSubmittingSub(true)
    try {
      await recurrentTransferWithAioha(PATRON_ACCOUNT, amount, 'HBD', RECURRENCE_HOURS, MAX_EXECUTIONS, PATRON_MEMO_TAG)
      toast({ status: 'success', title: 'Recurring support set up!', description: `${amount} HBD will be sent to @${PATRON_ACCOUNT} every month.` })
    } catch (err: any) {
      if (err?.code === 'needs_client_signing') {
        toast({ status: 'info', title: 'Connect a Hive wallet', description: err.message })
      } else {
        toast({ status: 'error', title: 'Could not set up recurring support', description: err?.message })
      }
    } finally {
      setIsSubmittingSub(false)
    }
  }

  const handleDelegate = async () => {
    if (!isLoggedIn || !username) return openLoginModal()
    const amount = parseFloat(delAmount)
    if (!Number.isFinite(amount) || amount <= 0) {
      toast({ status: 'warning', title: 'Enter an amount greater than 0' })
      return
    }
    setIsSubmittingDel(true)
    try {
      await delegateWithKeychain(username, PATRON_ACCOUNT, amount)
      toast({ status: 'success', title: 'Delegation sent!', description: `${amount} HP delegated to @${PATRON_ACCOUNT}.` })
    } catch (err: any) {
      toast({ status: 'error', title: 'Could not delegate', description: err?.message })
    } finally {
      setIsSubmittingDel(false)
    }
  }

  const handleWitnessVote = async () => {
    if (!isLoggedIn || !username) return openLoginModal()
    setIsSubmittingWitness(true)
    try {
      const result = await witnessVoteWithKeychain(username, PATRON_ACCOUNT)
      if (!result.success) throw new Error(result.error || 'Witness vote failed')
      toast({ status: 'success', title: 'Voted for @snapie as a witness!' })
      refetchAccount()
    } catch (err: any) {
      toast({ status: 'error', title: 'Could not cast witness vote', description: err?.message })
    } finally {
      setIsSubmittingWitness(false)
    }
  }

  return (
    <Box maxW="640px" mx="auto" px={4} py={10}>
      <VStack spacing={8} align="stretch">
        <VStack spacing={2} align="center" textAlign="center">
          <Heading size="lg">Support Snapie</Heading>
          <Text color="whiteAlpha.700" fontSize="sm" maxW="480px">
            Snapie stays free and open for everyone — nothing here is ever paywalled. If you&apos;d
            like to help keep it running, supporting the platform earns you a patron badge next
            to your name and a spot on the Patrons feed tab. Pure recognition, no strings.
          </Text>
        </VStack>

        <Box borderWidth={1} borderColor="whiteAlpha.200" borderRadius="xl" p={5}>
          <Heading size="sm" mb={3}>Patron tiers</Heading>
          <Table size="sm">
            <Thead>
              <Tr>
                <Th>Tier</Th>
                <Th>Recurring HBD/month</Th>
                <Th>HP delegated (by value)</Th>
              </Tr>
            </Thead>
            <Tbody>
              <Tr>
                <Td><HStack><PatronBadge tier="snaperino" /></HStack></Td>
                <Td>up to 1 HBD</Td>
                <Td>any amount{hivePriceUsd ? ` (under ~${Math.round(hpForUsd(75)!).toLocaleString()} HP)` : ''}</Td>
              </Tr>
              <Tr>
                <Td><HStack><PatronBadge tier="snapian" /></HStack></Td>
                <Td>1–5 HBD</Td>
                <Td>$75+{hivePriceUsd ? ` (~${Math.round(hpForUsd(75)!).toLocaleString()} HP)` : ' worth'}</Td>
              </Tr>
              <Tr>
                <Td><HStack><PatronBadge tier="snap-master" /></HStack></Td>
                <Td>5+ HBD</Td>
                <Td>$300+{hivePriceUsd ? ` (~${Math.round(hpForUsd(300)!).toLocaleString()} HP)` : ' worth'}</Td>
              </Tr>
            </Tbody>
          </Table>
          <Text fontSize="xs" color="whiteAlpha.500" mt={2}>
            Your badge is whichever tier is higher between the two paths below — sending more
            than a tier&apos;s minimum never penalizes you, it just places you in that tier.
            Delegation tiers track the current USD value of your HP, not a fixed amount — so a
            tier you reach never drops just because the market does; it can only go up.
          </Text>
        </Box>

        <Box borderWidth={1} borderColor="whiteAlpha.200" borderRadius="xl" p={5}>
          <Heading size="sm" mb={1}>Recurring HBD transfer</Heading>
          <Text fontSize="sm" color="whiteAlpha.600" mb={4}>
            A monthly transfer to @{PATRON_ACCOUNT}. Cancel anytime from your wallet.
          </Text>
          {isSnapie && (
            <Text fontSize="xs" color="orange.300" mb={3}>
              Recurring transfers aren&apos;t supported by Snapie&apos;s built-in wallet yet — connect a
              Hive wallet (Keychain, HiveAuth, etc.) to use this option.
            </Text>
          )}
          <HStack mb={3} spacing={2} flexWrap="wrap">
            {SUBSCRIPTION_PRESETS.map(p => (
              <Button key={p.tier} size="sm" variant="outline" onClick={() => setSubAmount(String(p.amount))}>
                {p.amount} HBD
              </Button>
            ))}
          </HStack>
          <HStack>
            <InputGroup maxW="160px">
              <Input
                type="number"
                min="0"
                step="0.1"
                value={subAmount}
                onChange={e => setSubAmount(e.target.value)}
              />
              <InputRightAddon>HBD/mo</InputRightAddon>
            </InputGroup>
            <Button
              colorScheme="blue"
              onClick={handleSubscribe}
              isLoading={isSubmittingSub}
              isDisabled={isSnapie}
            >
              Subscribe
            </Button>
          </HStack>
        </Box>

        <Box borderWidth={1} borderColor="whiteAlpha.200" borderRadius="xl" p={5}>
          <Heading size="sm" mb={1}>Delegate Hive Power</Heading>
          <Text fontSize="sm" color="whiteAlpha.600" mb={4}>
            Delegate HP to @{PATRON_ACCOUNT}. You keep ownership — undelegate anytime from your
            wallet (funds return after Hive&apos;s standard delegation cooldown). Buttons below show
            how much HP that is at today&apos;s price.
          </Text>
          <HStack mb={3} spacing={2} flexWrap="wrap">
            {DELEGATION_USD_PRESETS.map(p => {
              const hp = hpForUsd(p.usd)
              return (
                <Button
                  key={p.tier}
                  size="sm"
                  variant="outline"
                  isDisabled={!hp}
                  onClick={() => hp && setDelAmount(String(Math.round(hp)))}
                >
                  ${p.usd}{hp ? ` (~${Math.round(hp).toLocaleString()} HP)` : ''}
                </Button>
              )
            })}
          </HStack>
          <HStack>
            <InputGroup maxW="160px">
              <Input
                type="number"
                min="0"
                step="1"
                value={delAmount}
                onChange={e => setDelAmount(e.target.value)}
              />
              <InputRightAddon>HP</InputRightAddon>
            </InputGroup>
            <Button colorScheme="blue" onClick={handleDelegate} isLoading={isSubmittingDel}>
              Delegate
            </Button>
          </HStack>
        </Box>

        <Box borderWidth={1} borderColor="whiteAlpha.200" borderRadius="xl" p={5}>
          <Heading size="sm" mb={1}>Vote for Snapie as a witness</Heading>
          <Text fontSize="sm" color="whiteAlpha.600" mb={4}>
            Free — costs nothing and doesn&apos;t lock any funds. Witness votes are how Hive
            decides who helps run the chain; voting for @{PATRON_ACCOUNT} is its own way of
            supporting the platform, separate from the patron tiers above.
          </Text>
          {isSnapie && (
            <Text fontSize="xs" color="orange.300" mb={3}>
              Witness votes aren&apos;t supported by Snapie&apos;s built-in wallet yet — connect a
              Hive wallet (Keychain, HiveAuth, etc.) to use this option.
            </Text>
          )}
          {hasVotedForWitness ? (
            <HStack>
              <WitnessBadge voted />
              <Text fontSize="sm" color="whiteAlpha.700">You&apos;re already voting for @{PATRON_ACCOUNT}.</Text>
            </HStack>
          ) : (
            <Button
              colorScheme="green"
              onClick={handleWitnessVote}
              isLoading={isSubmittingWitness}
              isDisabled={isSnapie}
            >
              Vote for @{PATRON_ACCOUNT}
            </Button>
          )}
        </Box>

        <Divider />
        <Text fontSize="xs" color="whiteAlpha.400" textAlign="center">
          Patron status is recognized within a few minutes of your transfer or delegation
          landing on-chain.
        </Text>

        <SupportersSection />
      </VStack>
    </Box>
  )
}
