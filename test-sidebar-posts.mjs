import { Client } from '@hiveio/dhive';

const client = new Client([
  'https://api.hive.blog',
  'https://api.hivekings.com',
  'https://anyx.io',
  'https://api.openhive.network'
]);

// Hardcoded from .env.local for testing
const tag = 'hive-178315';
const communityTag = 'hive-178315';

async function getCommunityMutedAccounts(community) {
  try {
    const result = await client.call('bridge', 'list_community_roles', {
      community,
      limit: 1000
    });
    
    if (result && Array.isArray(result)) {
      const mutedAccounts = result
        .filter(item => item[1] === 'muted')
        .map(item => item[0]);
      console.log('📛 Muted accounts:', mutedAccounts);
      return mutedAccounts;
    }
    return [];
  } catch (error) {
    console.error('❌ Error fetching muted accounts:', error);
    return [];
  }
}

async function findPosts(query, params) {
  const by = 'get_discussions_by_' + query;
  console.log(`\n🔍 Calling: ${by}`);
  console.log('📋 Params:', JSON.stringify(params, null, 2));
  
  const posts = await client.database.call(by, [params]);
  return posts;
}

async function testSidebarLogic() {
  console.log('🧪 Testing Right Sidebar Post Fetching Logic');
  console.log('=' .repeat(60));
  console.log(`📌 Community Tag: ${communityTag}`);
  console.log(`📌 Search Tag: ${tag}`);
  console.log('=' .repeat(60));

  // Step 1: Get muted accounts
  console.log('\n📝 Step 1: Fetching muted accounts...');
  const mutedAccounts = await getCommunityMutedAccounts(communityTag);
  
  // Step 2: Fetch posts
  console.log('\n📝 Step 2: Fetching posts...');
  const params = {
    tag: tag,
    limit: 8,
    start_author: '',
    start_permlink: '',
  };

  const posts = await findPosts('created', params);
  
  console.log(`\n✅ Total posts fetched: ${posts.length}`);
  
  // Step 3: Filter out comments and muted accounts
  console.log('\n📝 Step 3: Filtering posts...');
  const topLevelPosts = posts.filter((post) => {
    const isTopLevel = post.parent_author === '';
    const isMuted = mutedAccounts.includes(post.author);
    
    if (!isTopLevel) {
      console.log(`  ❌ Filtered out comment: @${post.author}/${post.permlink} (parent: @${post.parent_author})`);
    }
    if (isMuted) {
      console.log(`  ❌ Filtered out muted: @${post.author}/${post.permlink}`);
    }
    
    return isTopLevel && !isMuted;
  });
  
  console.log(`\n✅ Top-level posts after filtering: ${topLevelPosts.length}`);
  
  // Step 4: Display results
  console.log('\n📋 Posts that should appear in sidebar:');
  console.log('=' .repeat(60));
  topLevelPosts.forEach((post, index) => {
    console.log(`\n${index + 1}. @${post.author}/${post.permlink}`);
    console.log(`   Title: ${post.title || '(no title)'}`);
    console.log(`   Created: ${post.created}`);
    console.log(`   Children: ${post.children}`);
    console.log(`   Category: ${post.category}`);
  });
  
  console.log('\n' + '=' .repeat(60));
  console.log('✅ Test completed!');
}

testSidebarLogic().catch(console.error);
