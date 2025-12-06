'use client'
import { useAioha } from '@aioha/react-ui'
import { KeyTypes } from '@aioha/aioha'
import { Flex, Input, Tag, TagCloseButton, TagLabel, Wrap, WrapItem, Button, useToast } from '@chakra-ui/react'
import dynamic from 'next/dynamic'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { prepareImageArray, validateTitle, validateContent } from '@/lib/utils/composeUtils'
import { createComposer, type Beneficiary } from '@snapie/operations'
import type { Beneficiary as BeneficiaryInputType } from '@/components/compose/BeneficiariesInput'

const Editor = dynamic(() => import('./Editor'), { ssr: false })

// Create a configured composer for blog posts
const blogComposer = createComposer({
  appName: 'Snapie.io',
  defaultTags: [],
  beneficiaries: [] // Will be set per-post
})

export default function Home() {
  const [markdown, setMarkdown] = useState("")
  const [title, setTitle] = useState("")
  const [hashtagInput, setHashtagInput] = useState("")
  const [hashtags, setHashtags] = useState<string[]>([])
  const [beneficiaries, setBeneficiaries] = useState<BeneficiaryInputType[]>([{ account: 'snapie', weight: 300 }]) // Default 3% to snapie
  const [isSubmitting, setIsSubmitting] = useState(false)

  const { aioha, user } = useAioha()
  const toast = useToast()
  const router = useRouter()
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

    // Log user object for debugging
    console.log('🔍 User object from Aioha:', { user, typeOfUser: typeof user });

    // The user from useAioha() should be a string (username)
    // If it's not a string, try to extract username from object
    const username = typeof user === 'string' ? user : (user as any)?.username || (user as any)?.name || '';
    
    console.log('🔍 Extracted username:', { username, trimmed: username.trim() });
    
    if (!username || username.trim() === '') {
      console.error('❌ Username is empty:', { user, username, typeOfUser: typeof user });
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
      // Prepare image array for metadata (first image becomes thumbnail)
      const imageArray = prepareImageArray(markdown)
      
      // Use SDK to build operations
      const composerResult = blogComposer.build({
        author: username,
        body: markdown,
        title: title,
        parentAuthor: '',
        parentPermlink: communityTag,
        tags: hashtags,
        beneficiaries: beneficiaries.map(b => ({ account: b.account, weight: b.weight })),
        metadata: {
          image: imageArray
        }
      })

      // Submit to Hive blockchain using Aioha
      console.log('📤 Submitting to Hive via Aioha:', { 
        operations: composerResult.operations,
        permlink: composerResult.permlink,
        username,
        operationAuthor: (composerResult.operations[0] as any)?.[1]?.author
      });
      
      const result = await aioha.signAndBroadcastTx(composerResult.operations, KeyTypes.Posting)
      
      console.log('📥 Aioha response:', result);

      // Check if submission was successful
      if (result.success) {
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

        // Redirect to post after delay (allow Hive node propagation)
        setTimeout(() => {
          router.push(`/@${username}/${composerResult.permlink}`)
        }, 3000)
      } else {
        throw new Error((result as any).errorMessage || (result as any).error || 'Failed to publish post')
      }
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
