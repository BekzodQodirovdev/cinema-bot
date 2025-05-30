import { Markup } from 'telegraf';

export const superAdminKeyboard = () => {
  return Markup.keyboard([
    ['👥 Userlar soni', '🎬 Kino qo\'shish'],
    ['🗑 Kino o\'chirish', '📢 Reklama yuborish'],
    ['💬 Xabar yuborish', '📺 Kanal qo\'shish'],
    ['❌ Kanal o\'chirish', '👨‍💼 Admin qo\'shish'],
    ['🗑 Admin o\'chirish']
  ]).resize().oneTime();
};