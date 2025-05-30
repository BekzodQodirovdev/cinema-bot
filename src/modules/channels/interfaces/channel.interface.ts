export interface Channel {
  channelId: string;
  username: string | null;
  name: string;
  inviteLink: string;
  isActive?: boolean;
} 