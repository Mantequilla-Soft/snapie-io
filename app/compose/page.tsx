'use client'
import { useAioha } from '@aioha/react-ui'
import { KeyTypes } from '@aioha/aioha'
import { Flex, Input, Tag, TagCloseButton, TagLabel, Wrap, WrapItem, Button, useToast } from '@chakra-ui/react'
import dynamic from 'next/dynamic'
import { useState } from 'react'
import { generatePermlink, prepareImageArray, validateTitle, validateContent } from '@/lib/utils/composeUtils'
import type { Beneficiary } from '@/components/compose/BeneficiariesInput'

const Editor = dynamic(() => import('./Editor'), { ssr: false })

export default function Home() {
  const [markdown, setMarkdown] = useState("")
  const [title, setTitle] = useState("")
  const [hashtagInput, setHashtagInput] = useState("")
  const [hashtags, setHashtags] = useState<string[]>([])
  const [beneficiaries, setBeneficiaries] = useState<Beneficiary[]>([{ account: 'snapie', weight: 300 }]) // Default 3% to snapie
  const [isSubmitting, setIsSubmitting] = useState(false)

  const { aioha, user } = useAioha()
  const toast = useToast()
  const communityTag = process.env.NEXT_PUBLIC_HIVE_COMMUNITY_TAG || 'blog'

  const handleHashtagKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const { key } = e
    if (key === " " && hashtagInput.trim()) { // If space is pressed and input is not empty
      setHashtags([...hashtags, hashtagInput.trim()])
      setHashtagInput("") // Clear input field
    } else if (key === "Backspace" && !hashtagInput && hashtags.length) {
      // Remove the last tag if backspace is hit and input is empty
      setHashtags(hashtags.slice(0, -1))
    }
  }

  const removeHashtag = (index: number) => {
    setHashtags(hashtags.filter((_, i) => i !== index))
  }

  async function handleSubmit() {
    // Validation
    const titleValidation = validateTitle(title)
    if (!titleValidation.valid) {
      toast({
        title: 'Invalid Title',
        description: titleValidation.error,
        status: 'error',
        duration: 3000,
        isClosable: true,
      })
      return
    }

    const contentValidation = validateContent(markdown)
    if (!contentValidation.valid) {
      toast({
        title: 'Invalid Content',
        description: contentValidation.error,
        status: 'error',
        duration: 3000,
        isClosable: true,
      })
      return
    }

    if (!user) {
      toast({
        title: 'Not Logged In',
        description: 'Please log in to publish a post',
        status: 'error',
        duration: 3000,
        isClosable: true,
      })
      return
    }

    // Additional check for empty username
    const username = typeof user === 'string' ? user : user?.username || user?.name || '';
    
    if (!username || username.trim() === '') {
      console.error('❌ Username is empty:', { user, username });
      toast({
        title: 'Authentication Error',
        description: 'Username not found. Please log out and log in again.',
        status: 'error',
        duration: 5000,
        isClosable: true,
      })
      return
    }

    console.log('👤 Publishing as:', username);

    setIsSubmitting(true)

    try {
      // Generate Hive-compatible permlink
      const permlink = generatePermlink(title)
      
      // Prepare image array for metadata (first image becomes thumbnail)
      const imageArray = prepareImageArray(markdown)
      
      // Create comment operation
      const commentOp = [
        'comment',
        {
          parent_author: '',
          parent_permlink: communityTag,
          author: username,
          permlink: permlink,
          title: title,
          body: markdown,
          json_metadata: JSON.stringify({ 
            tags: hashtags, 
            app: 'Snapie.io',
            image: imageArray
          })
        }
      ] as const;

      // Create comment_options operation with beneficiaries
      const optionsOp = [
        'comment_options',
        {
          author: username,
          permlink: permlink,
          max_accepted_payout: '1000000.000 HBD',
          percent_hbd: 10000,
          allow_votes: true,
          allow_curation_rewards: true,
          extensions: [
            [
              0,
              {
                beneficiaries: beneficiaries
                  .sort((a, b) => a.account.localeCompare(b.account)) // Hive requires sorted by account name
                  .map(b => ({ account: b.account, weight: b.weight }))
              }
            ]
          ]
        }
      ] as const;

      // Submit to Hive blockchain with beneficiaries
      console.log('📤 Submitting to Hive:', { commentOp, optionsOp });
      const result = await aioha.signAndBroadcastTx([commentOp, optionsOp], KeyTypes.Posting)
      console.log('✅ Hive response:', result);

      // Check if submission actually succeeded
      if (!result || (result.success === false)) {
        throw new Error(result?.error || 'Transaction failed - no response from blockchain')
      }

      // If we get here, submission was successful
      toast({
        title: 'Success!',
        description: 'Your post has been published to Hive blockchain',
        status: 'success',
        duration: 3000,
        isClosable: true,
      })

      // Clear form
      setMarkdown('')
      setTitle('')
      setHashtags([])
      setHashtagInput('')
      setBeneficiaries([{ account: 'snapie', weight: 300 }]) // Reset to default

      // Redirect to post after short delay
      setTimeout(() => {
        window.location.href = `/@${user}/${permlink}`
      }, 1500)
    } catch (error) {
      console.error('❌ Post submission error:', error)
      
      // Extract useful error message
      let errorMessage = 'Failed to publish post';
      
      if (error instanceof Error) {
        errorMessage = error.message;
      } else if (typeof error === 'object' && error !== null) {
        // Try to extract error from various possible structures
        const err = error as any;
        errorMessage = err.error?.message || err.message || err.error || JSON.stringify(error);
      }
      
      toast({
        title: 'Submission Failed',
        description: errorMessage,
        status: 'error',
        duration: 7000,
        isClosable: true,
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Flex
      width="100%"
      height={{ base: "calc(100vh - 80px)", md: "100vh" }}
      bg="background"
      justify="center"
      p="1"
      direction="column"
      overflow="hidden"
    >
      {/* Editor */}
      <Flex
        flex="1"
        border="1px solid"
        borderColor="border"
        borderRadius="base"
        justify="center"
        p="1"
        overflow="hidden" // Prevent internal scrolling
      >
        <Editor 
          markdown={markdown} 
          setMarkdown={setMarkdown} 
          title={title} 
          setTitle={setTitle}
          hashtagInput={hashtagInput}
          setHashtagInput={setHashtagInput}
          hashtags={hashtags}
          setHashtags={setHashtags}
          beneficiaries={beneficiaries}
          setBeneficiaries={setBeneficiaries}
          onSubmit={handleSubmit}
          isSubmitting={isSubmitting}
        />
      </Flex>
    </Flex>
  )
}
