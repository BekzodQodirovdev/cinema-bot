export class TelegramUtils {
  static formatUserInfo(user: any): string {
    const name = user.lastName 
      ? `${user.firstName} ${user.lastName}` 
      : user.firstName;
    
    const username = user.username ? `@${user.username}` : 'Username yo\'q';
    
    return `👤 ${name}\n🆔 ${user.telegramId}\n📱 ${username}\n🔰 ${user.role}`;
  }

  static formatMovieInfo(movie: any): string {
    return `🎬 ${movie.title}\n🔢 Kod: ${movie.code}\n📥 Yuklab olishlar: ${movie.downloadCount}\n📅 Qo'shilgan: ${new Date(movie.createdAt).toLocaleDateString('uz-UZ')}`;
  }

  static formatChannelInfo(channel: any): string {
    return `📺 ${channel.channelName}\n🆔 ${channel.channelId}\n📱 @${channel.channelUsername}`;
  }

  static isValidMovieCode(code: string): boolean {
    return /^[a-zA-Z0-9_-]+$/.test(code) && code.length >= 2 && code.length <= 20;
  }

  static extractChannelInfo(text: string): {
    channelId: string;
    channelUsername: string;
    channelName: string;
    inviteLink?: string;
  } | null {
    const parts = text.split('|');
    
    if (parts.length < 3) {
      return null;
    }

    return {
      channelId: parts[0].trim(),
      channelUsername: parts[1].trim().replace('@', ''),
      channelName: parts[2].trim(),
      inviteLink: parts[3]?.trim() || undefined,
    };
  }

  static extractMovieInfo(text: string): {
    code: string;
    title: string;
    description?: string;
  } | null {
    const parts = text.split('|');
    
    if (parts.length < 2) {
      return null;
    }

    return {
      code: parts[0].trim().toLowerCase(),
      title: parts[1].trim(),
      description: parts[2]?.trim() || undefined,
    };
  }

  static escapeMarkdown(text: string): string {
    return text.replace(/[_*\[\]()~`>#+=|{}.!-]/g, '\\## 12. Xususiyatlar');
  }
}