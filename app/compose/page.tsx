'use client'
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { signAndBroadcastWithKeychain, getUserSubscribedCommunities } from '@/lib/hive/client-functions'
import { Flex, Input, Tag, TagCloseButton, TagLabel, Wrap, WrapItem, Button, useToast } from '@chakra-ui/react'
import dynamic from 'next/dynamic'
import { useEffect, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { prepareImageArray, validateTitle, validateContent, generatePermlink } from '@/lib/utils/composeUtils'
import { createComposer, type Beneficiary } from '@snapie/operations'
import { useUserSettings } from '@/hooks/useUserSettings'
import type { Beneficiary as BeneficiaryInputType } from '@/components/compose/BeneficiariesInput'

const Editor = dynamic(() => import('./Editor'), { ssr: false })

const communityTag = process.env.NEXT_PUBLIC_HIVE_COMMUNITY_TAG || 'hive-blog'
const DRAFT_KEY = 'snapie_compose_draft'

// Create a configured composer for blog posts
const blogComposer = createComposer({
  appName: 'Snapie.io',
  defaultTags: [],
  beneficiaries: [] // Will be set per-post
})

const HANGOUT_THUMBNAIL = 'https://files.peakd.com/file/peakd-hive/meno/AKDgvpgFrvsp3fEazRgb971Pm8N7NqV3TUt1dF4TUY9798tUJHfZvwHE2BZB56Y.png';

function buildHangoutBody(audioUrl: string, thumbnail: string): string {
  return `![OpenPod Recording](${thumbnail})\n\n<center>\n\n### Listen to this OpenPod\n\n${audioUrl}\n\n[Play on 3Speak](${audioUrl})\n\n</center>\n\n---\n\n*Write a description of your OpenPod here...*`;
}

function buildHangoutBodyAwaitingAudio(thumbnail: string): string {
  return `![OpenPod Recording](${thumbnail})\n\n*Write a description of your OpenPod here. Use the audio button below to attach your recording before publishing.*`;
}

export default function Home() {
  const searchParams = useSearchParams()
  const isHangout = searchParams.get('hangout') === 'true'
  const hangoutTitle = searchParams.get('title') || ''
  const hangoutAudioUrl = searchParams.get('audioUrl') || ''
  const hangoutVideoUrl = searchParams.get('videoUrl') || ''
  const hangoutThumbnail = searchParams.get('thumbnail') || HANGOUT_THUMBNAIL

  const [markdown, setMarkdown] = useState(
    isHangout
      ? (hangoutAudioUrl
          ? buildHangoutBody(hangoutAudioUrl, hangoutThumbnail)
          : buildHangoutBodyAwaitingAudio(hangoutThumbnail))
      : ""
  )
  const [title, setTitle] = useState(isHangout ? hangoutTitle : "")
  const [hashtagInput, setHashtagInput] = useState("")
  const [hashtags, setHashtags] = useState<string[]>(
    isHangout
      ? hangoutVideoUrl
        ? ['openpod', 'hangout', 'video']
        : ['openpod', 'hangout', 'podcast']
      : []
  )
  const [beneficiaries, setBeneficiaries] = useState<BeneficiaryInputType[]>(
    isHangout
      ? [{ account: 'snapie', weight: 300 }, { account: 'threespeakfund', weight: hangoutVideoUrl ? 800 : 700 }]
      : [{ account: 'snapie', weight: 300 }]
  )
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [videoEmbedUrl, setVideoEmbedUrl] = useState<string | null>(hangoutVideoUrl || null)
  const [audioEmbedUrl, setAudioEmbedUrl] = useState<string | null>(null)
  const [videoThumbnailUrl, setVideoThumbnailUrl] = useState<string | null>(null)
  const [selectedCommunity, setSelectedCommunity] = useState(communityTag)
  const [communityOptions, setCommunityOptions] = useState<{ id: string; title: string }[]>([
    { id: communityTag, title: 'Snapie' },
  ])
  const [draftRestored, setDraftRestored] = useState(false)
  const draftTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Sync state when search params change (e.g., same-route navigation from recording upload)
  useEffect(() => {
    if (!isHangout) return

    setTitle(hangoutTitle)
    setHashtags(hangoutVideoUrl ? ['openpod', 'hangout', 'video'] : ['openpod', 'hangout', 'podcast'])
    setBeneficiaries([
      { account: 'snapie', weight: 300 },
      { account: 'threespeakfund', weight: hangoutVideoUrl ? 800 : 700 },
    ])
    setVideoEmbedUrl(hangoutVideoUrl || null)
    setMarkdown(
      hangoutAudioUrl
        ? buildHangoutBody(hangoutAudioUrl, hangoutThumbnail)
        : buildHangoutBodyAwaitingAudio(hangoutThumbnail)
    )
  }, [isHangout, hangoutTitle, hangoutAudioUrl, hangoutVideoUrl, hangoutThumbnail])

  // Restore draft on mount (skip hangout posts — they're pre-filled from URL)
  useEffect(() => {
    if (isHangout) return
    try {
      const raw = localStorage.getItem(DRAFT_KEY)
      if (!raw) return
      const draft = JSON.parse(raw)
      if (draft.title) setTitle(draft.title)
      if (draft.markdown) setMarkdown(draft.markdown)
      if (Array.isArray(draft.hashtags) && draft.hashtags.length) setHashtags(draft.hashtags)
      if (draft.selectedCommunity) setSelectedCommunity(draft.selectedCommunity)
      setDraftRestored(true)
    } catch {
      // corrupt draft — ignore
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-save draft to localStorage (debounced 1s, skipped for hangout posts)
  useEffect(() => {
    if (isHangout) return
    if (draftTimer.current) clearTimeout(draftTimer.current)
    draftTimer.current = setTimeout(() => {
      if (!title && !markdown && hashtags.length === 0) {
        localStorage.removeItem(DRAFT_KEY)
        return
      }
      localStorage.setItem(DRAFT_KEY, JSON.stringify({ title, markdown, hashtags, selectedCommunity }))
    }, 1000)
    return () => { if (draftTimer.current) clearTimeout(draftTimer.current) }
  }, [title, markdown, hashtags, selectedCommunity, isHangout])

  const { username: user } = useCurrentUser()
  const { percentHbd } = useUserSettings()
  const toast = useToast()
  const router = useRouter()

  useEffect(() => {
    if (!user) return
    const username = typeof user === 'string' ? user : (user as any)?.username || ''
    if (!username) return
    ;(async () => {
      try {
        const subs = await getUserSubscribedCommunities(username)
        const snapieOption = { id: communityTag, title: 'Snapie' }
        const others = subs.filter((s) => s.id !== communityTag)
        setCommunityOptions([snapieOption, ...others])
      } catch {
        // keep default Snapie option
      }
    })()
  }, [user])

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

  function clearDraft() {
    localStorage.removeItem(DRAFT_KEY)
    setDraftRestored(false)
    setTitle('')
    setMarkdown('')
    setHashtags([])
    setHashtagInput('')
    setSelectedCommunity(communityTag)
  }

  function handleVideoEmbedUrlChange(url: string | null) {
    setVideoEmbedUrl(url)
    setBeneficiaries(prev => {
      const without3speak = prev.filter(b => b.account !== 'threespeakfund')
      if (!url) return without3speak
      return [...without3speak, { account: 'threespeakfund', weight: 800 }]
        .sort((a, b) => a.account.localeCompare(b.account))
    })
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
      // Append video/audio embed URLs to body so they render as embeds in the post
      let postBody = markdown
      if (videoEmbedUrl) postBody = `${postBody}\n\n${videoEmbedUrl}`
      if (audioEmbedUrl) postBody = `${postBody}\n\n${audioEmbedUrl}`

      // Prepare image array for metadata (first image becomes thumbnail).
      // For video posts the body has no image markdown, so pass the video
      // thumbnail explicitly so it lands in json_metadata.image[0].
      const imageArray = prepareImageArray(postBody, videoThumbnailUrl)

      // Use SDK to build operations
      const composerResult = blogComposer.build({
        author: username,
        body: postBody,
        title: title,
        permlink: generatePermlink(title),
        parentAuthor: '',
        parentPermlink: selectedCommunity,
        tags: hashtags,
        beneficiaries: beneficiaries.map(b => ({ account: b.account, weight: b.weight })),
        percentHbd,
        metadata: {
          image: imageArray
        }
      })

      // Submit to Hive blockchain using Keychain
      console.log('📤 Submitting to Hive via Keychain:', { 
        operations: composerResult.operations,
        permlink: composerResult.permlink,
        username,
        operationAuthor: (composerResult.operations[0] as any)?.[1]?.author
      });
      
      const result = await signAndBroadcastWithKeychain(username, composerResult.operations, 'posting')
      
      console.log('📥 Keychain response:', result);

      // Check if submission was successful
      if (result.success) {
        toast({
          title: 'Success!',
          description: 'Your post has been published to Hive blockchain',
          status: 'success',
          duration: 3000,
          isClosable: true,
        })

        // Clear form and saved draft
        localStorage.removeItem(DRAFT_KEY)
        setDraftRestored(false)
        setMarkdown('')
        setTitle('')
        setHashtags([])
        setHashtagInput('')
        setBeneficiaries([{ account: 'snapie', weight: 300 }])
        setVideoEmbedUrl(null)
        setAudioEmbedUrl(null)
        setVideoThumbnailUrl(null)

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
        borderRadius="10px"
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
          lockedAccounts={
            isHangout
              ? ['snapie', 'threespeakfund']
              : videoEmbedUrl
                ? ['threespeakfund']
                : undefined
          }
          onSubmit={handleSubmit}
          isSubmitting={isSubmitting}
          onVideoEmbedUrlChange={handleVideoEmbedUrlChange}
          onAudioEmbedUrlChange={setAudioEmbedUrl}
          onVideoThumbnailChange={setVideoThumbnailUrl}
          initialVideoEmbedUrl={hangoutVideoUrl || null}
          initialVideoThumbnail={hangoutVideoUrl ? hangoutThumbnail : null}
          selectedCommunity={selectedCommunity}
          onCommunityChange={setSelectedCommunity}
          communityOptions={communityOptions}
          draftRestored={draftRestored}
          onDiscardDraft={clearDraft}
        />
      </Flex>
    </Flex>
  )
}
