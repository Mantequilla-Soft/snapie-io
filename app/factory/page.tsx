import type { Metadata } from 'next'
import { Box, Heading, Text, VStack } from '@chakra-ui/react'
import FactoryEmbed from '@/components/factory/FactoryEmbed'

export const metadata: Metadata = {
  title: 'Butter Factory',
  description: "A pixel-art factory that replays the last week of the Mantequilla-Soft team's pull requests.",
}

export default function FactoryPage() {
  return (
    <Box p={{ base: 4, md: 8 }} maxW="1100px" mx="auto">
      <VStack align="stretch" spacing={6}>
        <Box>
          <Heading size="lg">Butter Factory</Heading>
          <Text mt={2} color="fg.muted" maxW="68ch">
            Every repository is an island and every pull request is a worker. Press play to watch last week:
            workers fabricate an item, carry it to their island, queue for a review stamp, and drop it off when it
            merges. Click a worker or an island for details.
          </Text>
        </Box>

        <FactoryEmbed />

        <Text fontSize="sm" color="fg.muted" maxW="68ch">
          The map shows pull request activity only: no titles, descriptions or code. Private repositories appear as
          &quot;Mystery Island&quot; with no name or links. A new week is added every Monday.
        </Text>
      </VStack>
    </Box>
  )
}
