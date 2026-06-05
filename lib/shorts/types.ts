export interface ShortItem {
  id: string;
  author: string;
  hivePermlink: string;
  permlink: string;
  thumbnailUrl: string;
  title: string;
  views: number;
  timeAgo: string;
  stats: {
    likes: number;
    comments: number;
    payout: string;
  };
}
