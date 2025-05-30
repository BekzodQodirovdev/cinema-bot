import { Markup } from 'telegraf';

export const adminKeyboard = () => {
  return Markup.keyboard([
    ['👥 Userlar soni', '🎬 Kino qo\'shish'],
    ['🗑 Kino o\'chirish', '📢 Reklama yuborish'],
    ['💬 Xabar yuborish', '📺 Kanal qo\'shish'],
    ['❌ Kanal o\'chirish']
  ]).resize().oneTime();
};