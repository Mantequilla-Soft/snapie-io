# Video Reload Fix - Technical Documentation

## Problem Statement

When users interacted with a snap (voting, moving the slider, etc.), embedded videos would reload and restart playback. This created a terrible user experience where videos would constantly restart whenever the user tried to interact with the post.

## Root Cause Analysis

The issue was caused by **React re-rendering** the entire `Snap` component whenever any state changed. The chain of events was:

1. User clicks heart icon → `showSlider` state changes
2. User moves slider → `sliderValue` state changes  
3. User clicks vote → `voted` and `voteCount` states change
4. Any state change → `Snap` component re-renders
5. Snap re-renders → `MediaRenderer` gets re-evaluated
6. MediaRenderer re-evaluation → React thinks it's a new component instance
7. Video element gets unmounted and remounted → **video reloads and restarts playback**

Even though we had `React.memo` on `MediaRenderer`, the parent component's re-render was still causing the video to reload because:
- The memo comparison was checking props that were getting recreated on each render
- State changes in the parent forced re-evaluation of all child components
- React's reconciliation algorithm saw the MediaRenderer as a "different" element

## Solution Architecture

### Key Principle: State Isolation

The solution was to **completely isolate voting state from the Snap component** so that voting interactions don't trigger Snap re-renders.

### Implementation Details

#### 1. Created Separate VoteControls Component

**File:** `components/homepage/VoteControls.tsx` (originally `VoteSlider.tsx`)

Moved ALL voting-related state into this isolated component:
- `voted` - Whether the user has voted
- `voteCount` - Number of votes
- `showSlider` - Whether the slider is visible
- `sliderValue` - The current slider position (1-100%)
- `isVoting` - Loading state during API call

```tsx
const VoteControls = memo(({ initialVoted, initialVoteCount, onVote }: VoteControlsProps) => {
    const [voted, setVoted] = useState(initialVoted);
    const [voteCount, setVoteCount] = useState(initialVoteCount);
    const [showSlider, setShowSlider] = useState(false);
    const [sliderValue, setSliderValue] = useState(5);
    const [isVoting, setIsVoting] = useState(false);
    // ... component logic
});
```

#### 2. Optimized MediaRenderer

**File:** `components/shared/MediaRenderer.tsx`

Applied multiple layers of optimization:

1. **React.memo** - Prevents re-renders when props don't change
```tsx
const MediaRenderer = memo(({ mediaContent }: MediaRendererProps) => {
  // ...
}, (prevProps, nextProps) => {
  return prevProps.mediaContent === nextProps.mediaContent;
});
```

2. **Stable keys** - Used content-based keys instead of array indices
```tsx
<Box key={`video-${item.src}`} mb={2}>
  <VideoRenderer src={item.src} />
</Box>
```

3. **Display name** - Helps React DevTools and debugging
```tsx
MediaRenderer.displayName = 'MediaRenderer';
```

#### 3. Updated Snap Component

**File:** `components/homepage/Snap.tsx`

Key changes:
1. Removed all voting state (`voted`, `voteCount`, `showSlider`, `sliderValue`)
2. Simplified `handleVote` to just make the API call
3. Added stable key to MediaRenderer
4. Passed only initial values to VoteControls

```tsx
// Before (BAD):
const [voted, setVoted] = useState(...)
const [voteCount, setVoteCount] = useState(...)
const [showSlider, setShowSlider] = useState(false)

// After (GOOD):
// No voting state in Snap component!
<VoteControls 
    initialVoted={comment.active_votes?.some(item => item.voter === user) ?? false}
    initialVoteCount={comment.active_votes?.length || 0}
    onVote={handleVote}
/>
```

## Technical Benefits

### 1. Component Re-render Isolation
- Voting interactions only re-render `VoteControls`
- `Snap` component remains stable
- `MediaRenderer` never re-evaluates
- Video element stays mounted

### 2. Performance Improvements
- Reduced unnecessary re-renders
- Smaller React reconciliation tree
- Better React DevTools performance
- Smoother UI interactions

### 3. State Management
- Clear separation of concerns
- Self-contained voting logic
- Easier to test and debug
- Better component reusability

## Flow Diagram

```
Before Fix:
User clicks heart
    → Snap setState (showSlider)
        → Snap re-renders
            → MediaRenderer re-evaluates
                → Video unmounts
                    → Video remounts
                        → VIDEO RELOADS ❌

After Fix:
User clicks heart
    → VoteControls setState (showSlider)
        → VoteControls re-renders
            → Snap stays unchanged
                → MediaRenderer stays unchanged
                    → Video stays mounted
                        → VIDEO KEEPS PLAYING ✅
```

## Testing Checklist

To verify the fix works:

- [ ] Click heart icon - video continues playing
- [ ] Move slider - video continues playing
- [ ] Click vote button - video continues playing
- [ ] Vote completes - video continues playing
- [ ] Close slider - video continues playing
- [ ] Scroll snap out of view - video pauses (expected)
- [ ] Scroll snap back into view - video resumes from same position

## Related Files

- `/components/homepage/Snap.tsx` - Main snap component
- `/components/homepage/VoteSlider.tsx` - Voting UI component (VoteControls)
- `/components/shared/MediaRenderer.tsx` - Media rendering with memoization
- `/components/layout/VideoRenderer.tsx` - Video player component

## Lessons Learned

1. **State placement matters** - State should live in the component that needs it, not higher up
2. **React.memo is not magic** - Memoization only works if the parent doesn't force re-renders
3. **Keys are important** - Use stable, content-based keys, not array indices
4. **Isolate interactive components** - UI controls that change frequently should be isolated

## References

- React memo: https://react.dev/reference/react/memo
- React reconciliation: https://react.dev/learn/preserving-and-resetting-state
- SkateHive implementation: https://github.com/SkateHive/skatehive3.0/blob/main/components/homepage/Snap.tsx

---

**Fixed:** February 7, 2026  
**Issue:** Video reloading on user interaction  
**Solution:** State isolation + React.memo optimization
