# MyCommunity - Hive Community Frontend

A customizable Next.js frontend for Hive blockchain communities, featuring snaps (short posts), blog posts, wallet integration, and multiple theme support.

🌐 **Live Demo:** [mycommunity-omega.vercel.app](https://mycommunity-omega.vercel.app/)

## 🎨 Features

- **Snaps Feed** - Twitter-like short posts with media support
- **Blog Posts** - Long-form content with markdown support
- **Multiple Tabs** - Filter by community, all posts, or following
- **Wallet Integration** - View balances, tokens, and transaction history
- **Hive Post Previews** - Rich preview cards for shared Hive posts
- **Theme System** - 8 pre-built themes (HiveBR, Nounish, Cannabis, Mengão, Bluesky, Hacker, Forest, Windows95)
- **Hive Authentication** - Login via Keychain, HiveAuth, Ledger, or PeakVault
- **Responsive Design** - Mobile-first with full desktop support

---

## 📋 Table of Contents

- [Quick Start](#-quick-start-for-developers)
- [Deploy to Vercel (No Coding Required)](#-deploy-to-vercel-no-coding-required)
- [Environment Variables](#-environment-variables-explained)
- [Customization Guide](#-customization-guide)
- [Project Structure](#-project-structure)
- [Contributing](#-contributing)

---

## 🚀 Quick Start (For Developers)

### Prerequisites

- Node.js 18+ installed
- pnpm, npm, or yarn package manager
- A Hive blockchain account

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/bgrana75/mycommunity.git
   cd mycommunity
   ```

2. **Install dependencies**
   ```bash
   pnpm install
   # or
   npm install
   # or
   yarn install
   ```

3. **Set up environment variables**
   ```bash
   cp .env.local.example .env.local
   ```
   
   Edit `.env.local` with your community settings (see [Environment Variables](#-environment-variables-explained))

4. **Run the development server**
   ```bash
   pnpm dev
   # or
   npm run dev
   # or
   yarn dev
   ```

5. **Open your browser**
   
   Navigate to [http://localhost:3310](http://localhost:3310)

---

## 🌐 Deploy to Vercel (No Coding Required)

Perfect for community managers who want to deploy without touching code!

### Step 1: Create a GitHub Account (if you don't have one)

1. Go to [github.com](https://github.com)
2. Click **Sign up** in the top right
3. Follow the prompts to create your account
4. Verify your email address

### Step 2: Fork This Repository

1. **Log in to GitHub** with your account
2. **Visit this repository**: [github.com/bgrana75/mycommunity](https://github.com/bgrana75/mycommunity)
3. Click the **Fork** button in the top right corner
4. Click **Create fork** (keep all default settings)
5. Wait for GitHub to create your copy (this takes about 10 seconds)
6. You now have your own copy at `github.com/YOUR-USERNAME/mycommunity`

### Step 3: Create a Vercel Account

1. Go to [vercel.com](https://vercel.com)
2. Click **Sign Up** in the top right
3. Choose **Continue with GitHub**
4. Authorize Vercel to access your GitHub account
5. Complete your profile (name, etc.)

### Step 4: Deploy Your Site

1. **From your Vercel dashboard**, click **Add New Project**
2. **Import your forked repository**:
   - You'll see a list of your GitHub repositories
   - Find `mycommunity` and click **Import**
3. **Configure your project**:
   - **Project Name**: Choose a name (e.g., `my-hive-community`)
   - **Framework Preset**: Next.js (should be auto-detected)
   - **Root Directory**: `./` (leave as default)
   - **Environment Variables**: Click **Add** and enter these (see detailed explanations below):
     ```
     NEXT_PUBLIC_THEME=forest
     NEXT_PUBLIC_HIVE_COMMUNITY_TAG=hive-123456
     NEXT_PUBLIC_HIVE_SEARCH_TAG=hive-123456
     NEXT_PUBLIC_HIVE_USER=yourusername
     HIVE_POSTING_KEY=posting_private_key_here_ //used for uploading images
     ```
4. Click **Deploy**
5. Wait 2-3 minutes for the build to complete
6. Your site is live! 🎉

### Step 5: Access Your Site

- Vercel will give you a URL like: `my-hive-community.vercel.app`
- You can add a custom domain later in Vercel settings

### Step 6: Making Updates

When you want to make changes:

1. **Edit files on GitHub**:
   - Go to your forked repository on GitHub
   - Navigate to the file you want to edit
   - Click the pencil icon (Edit this file)
   - Make your changes
   - Click **Commit changes**

2. **Automatic deployment**:
   - Vercel automatically detects changes
   - Your site rebuilds in 2-3 minutes
   - No need to do anything else!

---

## 🔧 Environment Variables Explained

Create a `.env.local` file in the root directory with these variables:

### Required Variables

#### `NEXT_PUBLIC_THEME`
**What it does**: Sets the color scheme and styling of your site  
**Options**: `hivebr`, `nounish`, `cannabis`, `mengao`, `bluesky`, `hacker`, `forest`, `windows95`  
**Example**: `NEXT_PUBLIC_THEME=hivebr`  
**How to change**: Just type one of the theme names above

#### `NEXT_PUBLIC_HIVE_COMMUNITY_TAG`
**What it does**: Sets which Hive community's posts to show  
**Format**: `hive-XXXXXX` (6 digits)  
**Example**: `NEXT_PUBLIC_HIVE_COMMUNITY_TAG=hive-173115`  
**How to find**:
1. Go to your community on Hive (e.g., PeakD)
2. Look at the URL: `peakd.com/c/hive-173115/created`
3. Copy the `hive-XXXXXX` part

#### `NEXT_PUBLIC_HIVE_SEARCH_TAG`
**What it does**: Tag used for searching/filtering posts  
**Format**: Usually the same as your community tag  
**Example**: `NEXT_PUBLIC_HIVE_SEARCH_TAG=hive-173115`  
**Note**: Keep this the same as `NEXT_PUBLIC_HIVE_COMMUNITY_TAG` unless you have a specific reason

#### `NEXT_PUBLIC_HIVE_USER`
**What it does**: Your Hive username for posting (optional for read-only sites)  
**Example**: `NEXT_PUBLIC_HIVE_USER=yourusername`  
**Note**: Don't include the @ symbol

### Optional Variables

#### `NEXT_PUBLIC_DISPLAY_CURRENCY`
**What it does**: Shows post payouts in your preferred currency instead of HBD/USD  
**Options**: Leave empty for HBD/USD, or use: `BRL`, `EUR`, `GBP`, `JPY`, `AUD`, `CAD`, `CHF`, `CNY`, `INR`  
**Example**: `NEXT_PUBLIC_DISPLAY_CURRENCY=BRL` (for Brazilian Reals)  
**Default**: Empty (displays as HBD/USD with $ symbol)  
**Note**: Exchange rates are cached for 6 hours to minimize API calls. HBD is treated as $1 USD when no currency is specified.

#### `HIVE_POSTING_KEY`
**What it does**: needed for signing the image files to upload to hive.blog
**Example**: `HIVE_POSTING_KEY=5JxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxQ`  
**⚠️ WARNING**: Never share this key! Only use in secure server environments.  
**Note**: Most users don't need this - Aioha (Keychain / HiveAuth / Ledger / PeakVault) handles authentication

#### `NEXT_PUBLIC_HANGOUTS_API_URL`
**What it does**: Backend URL for voice/video hangouts
**Example**: `NEXT_PUBLIC_HANGOUTS_API_URL=https://hangout-api.3speak.tv`
**Default**: None — hangout previews and rooms fail to load if unset.

#### `NEXT_PUBLIC_LIVEKIT_URL`
**What it does**: LiveKit WebSocket URL used by the hangouts feature
**Example**: `NEXT_PUBLIC_LIVEKIT_URL=wss://livekit.3speak.tv`
**Default**: `wss://livekit.3speak.tv`

#### `NEXT_PUBLIC_HIVESIGNER_ENABLED`
**What it does**: Shows HiveSigner as a login option when set to `true`.
**Default**: `false` — hidden until your app id / callback URL are configured.

#### `NEXT_PUBLIC_3SPEAK_API_KEY`
**What it does**: Enables 3Speak video + audio upload from the composer.
**How to get**: https://embed.3speak.tv/

#### `NEXT_PUBLIC_IMAGE_SERVER_API_KEY`
**What it does**: Fallback image host when `images.hive.blog` is unavailable.
**How to get**: https://images.3speak.tv/

### Example .env.local File

```bash
# Theme Selection
NEXT_PUBLIC_THEME=hivebr

# Community Settings
NEXT_PUBLIC_HIVE_COMMUNITY_TAG=hive-173115
NEXT_PUBLIC_HIVE_SEARCH_TAG=hive-173115

# Your Hive Username
NEXT_PUBLIC_HIVE_USER=yourusername

HIVE_POSTING_KEY=5Jxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

---

## 🎨 Customization Guide

### Changing Themes

1. **Via Environment Variable** (Easiest):
   - Update `NEXT_PUBLIC_THEME` in `.env.local`
   - Restart your dev server or redeploy

2. **Creating a Custom Theme**:
   ```typescript
   // Create: themes/myTheme.ts
   import { extendTheme } from '@chakra-ui/react';
   
   export const myTheme = extendTheme({
     colors: {
       background: '#your-color',
       text: '#your-color',
       primary: '#your-color',
       secondary: '#your-color',
       accent: '#your-color',
       muted: '#your-color',
       border: '#your-color',
     },
     // ... more customization
   });
   ```
   
   Then add it to `app/providers.tsx`:
   ```typescript
   import { myTheme } from '@/themes/myTheme'
   
   const themeMap = {
     // ... existing themes
     myTheme: myTheme,
   }
   ```

### Changing Community

Update these in `.env.local`:
- `NEXT_PUBLIC_HIVE_COMMUNITY_TAG` - Your community's tag
- `NEXT_PUBLIC_HIVE_SEARCH_TAG` - Same as above (usually)

### Customizing the Logo/Avatar

The community avatar is automatically fetched from the Hive blockchain using your community tag. To change it, update your community's profile image on Hive.

---

## 📁 Project Structure

```
mycommunity/
├── app/                        # Next.js 14 app directory
│   ├── layout.tsx             # Root layout with providers
│   ├── page.tsx               # Home page (snaps feed)
│   ├── blog/                  # Blog posts pages
│   ├── compose/               # Create post page
│   └── [...slug]/             # Dynamic routes
├── components/                 # React components
│   ├── homepage/              # Feed, snaps, composer
│   ├── blog/                  # Blog post components
│   ├── profile/               # User profile pages
│   ├── wallet/                # Wallet & transactions
│   ├── layout/                # Header, sidebar, navigation
│   └── shared/                # Reusable components
├── hooks/                      # Custom React hooks
│   ├── useSnaps.ts            # Snaps feed logic
│   ├── usePosts.ts            # Blog posts logic
│   └── useHiveAccount.ts      # Account data
├── lib/                        # Utility functions
│   ├── hive/                  # Hive blockchain integration
│   └── utils/                 # Helper functions
├── themes/                     # Theme definitions
│   ├── hivebr.ts
│   ├── nounish.ts
│   └── ... (8 themes total)
├── types/                      # TypeScript type definitions
├── public/                     # Static assets
└── .env.local                 # Environment configuration
```

---

## 🛠️ Common Tasks

### Update Your Community's Posts
Posts are automatically fetched from the Hive blockchain based on your `NEXT_PUBLIC_HIVE_COMMUNITY_TAG`. No manual updates needed!

### Add a Custom Domain (Vercel)
1. Go to your project in Vercel dashboard
2. Click **Settings** → **Domains**
3. Add your domain and follow DNS instructions
4. Wait for DNS propagation (5-30 minutes)

### Change the Site Title/Meta Tags
Edit `app/layout.tsx`:
```typescript
export const metadata = {
  title: 'Your Community Name',
  description: 'Your community description',
}
```

---

## 🤝 Contributing

Contributions are welcome! Here's how:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

### Development Guidelines

- Use TypeScript for new files
- Follow the existing code style
- Test your changes locally before submitting
- Update documentation if needed

---

## 📚 Tech Stack

- **Framework**: [Next.js 14](https://nextjs.org/) (App Router)
- **UI Library**: [Chakra UI](https://chakra-ui.com/)
- **Blockchain**: [Hive](https://hive.io/) via [@hiveio/dhive](https://www.npmjs.com/package/@hiveio/dhive)
- **Authentication**: [Aioha](https://www.npmjs.com/package/@aioha/aioha) (Keychain, HiveAuth, Ledger, PeakVault)
- **Styling**: [Tailwind CSS](https://tailwindcss.com/)
- **Language**: [TypeScript](https://www.typescriptlang.org/)
- **Package Manager**: pnpm (or npm/yarn)

---

## 🐛 Troubleshooting

### Site not loading after deployment
- Check environment variables are set correctly in Vercel
- Verify your community tag exists on Hive
- Check Vercel build logs for errors

### Posts not showing
- Confirm `NEXT_PUBLIC_HIVE_COMMUNITY_TAG` is correct
- Check if your community has posts with that tag
- Try a different tab (All or Following)

### Theme not applying
- Verify theme name is spelled correctly in `.env.local`
- Check if theme exists in `themes/` folder
- Restart development server after changing .env

### "Following" tab not working
- You must be logged in via Keychain or another provider
- Check if you're following any users
- Try refreshing the page

---

## 📄 License

This project is open source and available under the MIT License.

---

## 🙏 Acknowledgments

- Built on the Hive blockchain
- Community-driven development

---

## 📞 Support

- **Issues**: [GitHub Issues](https://github.com/bgrana75/mycommunity/issues)
- **Discussions**: [GitHub Discussions](https://github.com/bgrana75/mycommunity/discussions)
- **Hive**: Contact [@mengao](https://peakd.com/@mengao)

---

**Made with ❤️ for the Hive community**
