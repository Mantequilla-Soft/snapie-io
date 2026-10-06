import PostPage from '@/components/blog/PostPage';

export default function PostView({ author, permlink }: { author: string; permlink: string }) {
  return <PostPage author={author} permlink={permlink} />;
}
