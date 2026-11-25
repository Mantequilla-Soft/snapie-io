import { describe, expect, it } from 'vitest'
import { discussionReplies } from './discussionTree'

describe('discussionReplies', () => {
  const discussion = {
    'hiveio/launch': {
      author: 'hiveio',
      permlink: 'launch',
      replies: ['alice/top', 'bob/top', 'missing/gone'],
    },
    'alice/top': {
      author: 'alice',
      permlink: 'top',
      body: 'hello',
      replies: ['carol/nested', 'hiveio/launch'],
    },
    'carol/nested': {
      author: 'carol',
      permlink: 'nested',
      replies: [],
    },
    'bob/top': {
      author: 'bob',
      permlink: 'top',
      replies: ['alice/top'],
    },
  }

  it('returns direct replies with nested replies attached, and skips a missing or repeated post', () => {
    const replies = discussionReplies(discussion, 'hiveio', 'launch')
    expect(replies.map((reply) => reply.author)).toEqual(['alice', 'bob'])
    expect(replies[0].body).toBe('hello')
    expect(replies[0].replies).toEqual([
      expect.objectContaining({ author: 'carol', permlink: 'nested', replies: [] }),
    ])
    // alice/top was already placed under the root, so bob does not get a second copy.
    expect(replies[1].replies).toEqual([])
  })

  it('returns nothing when the root post is absent', () => {
    expect(discussionReplies(discussion, 'hiveio', 'other')).toEqual([])
    expect(discussionReplies(null, 'hiveio', 'launch')).toEqual([])
  })
})
