import { Markup } from 'telegraf';

export const adminKeyboard = () => {
  return Markup.keyboard([
    ["🎬 Kino qo'shish", "🗑 Kino o'chirish"],
    ["📺 Kanal qo'shish", "❌ Kanal o'chirish"],
    ['📢 Reklama yuborish', '💬 Xabar yuborish'],
    ['👥 Userlar soni', '📺 Kanallar'],
    ['📋 Kinolar']
  ]).resize();
};