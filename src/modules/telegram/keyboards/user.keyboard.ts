import { Markup } from 'telegraf';

interface Channel {
  channelId: string;
  name: string;
  inviteLink: string;
}

export function createSubscriptionKeyboard(channels: Channel[], unsubscribedChannels: string[]) {
  const keyboard: any[][] = [];

  for (const channel of channels) {
    if (unsubscribedChannels.includes(channel.channelId)) {
      keyboard.push([
        Markup.button.url(
          `❌ ${channel.name}`,
          channel.inviteLink.trim()
        )
      ]);
    }
  }

  if (keyboard.length > 0) {
    keyboard.push([
      Markup.button.callback('🔄 Tekshirish', 'check_subscription')
    ]);
  }

  return Markup.inlineKeyboard(keyboard);
}
