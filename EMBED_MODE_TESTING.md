# Embed Mode Testing Guide

## ✅ Implementation Complete

All embed mode features have been successfully implemented for snapie.io.

---

## 📋 What Was Changed

### 1. **Created useEmbedMode Hook** (`hooks/useEmbedMode.ts`)
- Detects `?embed=true` URL parameter
- Supports optional theme parameters (`theme`, `bgColor`, `textColor`)
- Automatically adds `embed-mode` class to body
- Sends message to parent frame when loaded

### 2. **Added Embed Mode CSS** (`app/globals.css`)
- Hides all navigation elements (header, footer, sidebar)
- Removes interactive elements (vote buttons, comment forms, share buttons)
- Optimizes content containers for mobile WebView
- Ensures responsive images
- Enables touch scrolling for WebView

### 3. **Updated Root Layout** (`app/layout.tsx`)
- Conditionally renders Sidebar, FooterNavigation, and ChatPanel
- Disables chat polling in embed mode
- Adjusts content margins for embed mode
- Wrapped in Suspense for proper Next.js SSR handling

### 4. **Updated PostPage Component** (`components/blog/PostPage.tsx`)
- Detects embed mode via URL parameters
- Hides SnapComposer, SnapList, and Conversation in embed mode
- Adjusts container width and padding for embed mode
- Prevents modals from opening in embed mode

### 5. **Updated PostDetails Component** (`components/blog/PostDetails.tsx`)
- Accepts `isEmbedMode` prop
- Hides all interactive elements (vote, comment, share buttons) in embed mode
- Adjusts styling for clean embed display
- Disables navigation links in embed mode

---

## 🧪 Testing URLs

### Test 1: Normal Mode (Full Site)
```
http://localhost:3000/@menobass/some-post
```
**Expected:**
- ✅ Full navigation visible (sidebar, footer menu)
- ✅ Vote buttons work
- ✅ Comment section visible
- ✅ Share buttons present
- ✅ Chat panel available

---

### Test 2: Embed Mode (Minimal View)
```
http://localhost:3000/@menobass/some-post?embed=true
```
**Expected:**
- ✅ No sidebar navigation
- ✅ No footer navigation
- ✅ No vote/comment/share buttons
- ✅ Clean post content only
- ✅ Responsive images
- ✅ Mobile-optimized padding (12px)
- ✅ No chat panel

---

### Test 3: Embed Mode with Dark Theme
```
http://localhost:3000/@menobass/some-post?embed=true&theme=dark&bgColor=%23000000&textColor=%23FFFFFF
```
**Expected:**
- ✅ All embed mode features
- ✅ Dark background (#000000)
- ✅ White text (#FFFFFF)
- ✅ Theme class applied to body

---

### Test 4: Embed Mode with Custom Colors
```
http://localhost:3000/@menobass/some-post?embed=true&bgColor=%23F5F5F5&textColor=%23333333
```
**Expected:**
- ✅ Light gray background (#F5F5F5)
- ✅ Dark gray text (#333333)

---

## 🔍 What to Check

### Visual Inspection
1. **Navigation Removal**
   - Open DevTools
   - Check that sidebar, footer, and chat panel have `display: none`
   - Verify body has `embed-mode` class

2. **Content Display**
   - Post title should be visible and centered
   - Author info should show (without clickable link in embed mode)
   - Content should be full-width with minimal padding
   - Images should be responsive (max-width: 100%)

3. **Interactive Elements**
   - Vote buttons should not be visible
   - Comment form should not appear
   - Share button should not be present
   - Slider should not render

4. **Scrolling**
   - Content should scroll smoothly
   - Touch scrolling should work on mobile devices
   - No horizontal scroll bars

### Developer Tools Check
Open browser DevTools and check:
```javascript
// Console check
document.body.classList.contains('embed-mode') // Should be true

// Check computed styles
getComputedStyle(document.querySelector('header')).display // Should be 'none'
getComputedStyle(document.querySelector('footer')).display // Should be 'none'
```

---

## 🚀 Integration with HiveSnaps

### WebView Implementation (iOS/Android)
```swift
// iOS Example
let url = URL(string: "https://www.snapie.io/@\(author)/\(permlink)?embed=true&theme=dark")
webView.load(URLRequest(url: url!))
```

```kotlin
// Android Example
val url = "https://www.snapie.io/@$author/$permlink?embed=true&theme=dark"
webView.loadUrl(url)
```

### Listen for Load Event
```javascript
// In HiveSnaps WebView
window.addEventListener('message', (event) => {
  if (event.data.type === 'snapie-loaded') {
    console.log('Snapie content loaded successfully');
  }
});
```

---

## ✨ Features

### Supported URL Parameters
- `embed=true` (required) - Activates embed mode
- `theme=dark|light` (optional) - Sets theme class
- `bgColor=%23RRGGBB` (optional) - Sets background color (URL-encoded hex)
- `textColor=%23RRGGBB` (optional) - Sets text color (URL-encoded hex)

### Hidden Elements in Embed Mode
- ✅ Sidebar navigation
- ✅ Footer navigation
- ✅ Header (if any)
- ✅ Chat panel
- ✅ Vote buttons and slider
- ✅ Comment forms and reply buttons
- ✅ Share buttons
- ✅ Follow/unfollow buttons
- ✅ Any floating action buttons

### Optimizations Applied
- ✅ Full-width content (no max-width constraints)
- ✅ Mobile-optimized padding (12px)
- ✅ Responsive images (100% width, auto height)
- ✅ Touch-enabled scrolling
- ✅ No navigation hijacking
- ✅ Transparent background support

---

## 🛡️ Risk Assessment: MINIMAL

- **No breaking changes** - Existing routes work identically
- **Additive only** - New feature doesn't affect normal mode
- **Client-side only** - No server or API changes
- **Easy rollback** - Remove `?embed=true` to revert to normal view
- **Isolated CSS** - All styles scoped to `.embed-mode` class

---

## 📱 Next Steps

1. **Test locally** using the URLs above
2. **Deploy to staging** for integration testing
3. **Update HiveSnaps app** to use new embed URLs
4. **Monitor WebView performance** in mobile app
5. **Gather user feedback** on reading experience

---

## 🐛 Troubleshooting

### Issue: Navigation still visible
- Check that URL has `?embed=true` (not `?embed=1` or `&embed=true`)
- Verify body has `embed-mode` class in DevTools
- Clear browser cache

### Issue: Content not full-width
- Check container max-width in DevTools
- Ensure CSS is properly loaded
- Verify no conflicting theme styles

### Issue: Interactive buttons still showing
- Check that components receive `isEmbedMode` prop
- Verify CSS classes like `.post-actions` are present
- Inspect element to see if styles are applied

### Issue: Scrolling not working
- Check WebView settings in mobile app
- Verify no `overflow: hidden` on parent elements
- Test on different devices

---

**Implementation Date:** January 10, 2026  
**Status:** ✅ Ready for Testing
