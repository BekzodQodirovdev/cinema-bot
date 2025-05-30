import { Injectable, OnModuleInit } from '@nestjs/common';
import { Telegraf, Context, Markup } from 'telegraf';
import { Message } from 'telegraf/typings/core/types/typegram';
import { ExtraReplyMessage } from 'telegraf/typings/telegram-types';
import { InlineKeyboardButton } from 'telegraf/src/core/types/typegram';
import { UsersService } from '../users/users.service';
import { MoviesService } from '../movies/movies.service';
import { ChannelsService } from '../channels/channels.service';
import { StateService } from './state.service';
import { BotStep } from './interfaces/bot-state.interface';
import { superAdminKeyboard } from './keyboards/super-admin.keyboard';
import { adminKeyboard } from './keyboards/admin.keyboard';
import { createSubscriptionKeyboard } from './keyboards/user.keyboard';
import * as path from 'path';
import axios from 'axios';

interface UrlButton {
  text: string;
  url: string;
}

interface AdState {
  mediaId?: string;
  mediaType?: 'photo' | 'video' | 'animation';
  caption?: string;
}

interface SendMessageOptions extends ExtraReplyMessage {
  caption?: string;
  parse_mode?: 'HTML';
  reply_markup?: {
    inline_keyboard: UrlButton[][];
  };
}

@Injectable()
export class TelegramService implements OnModuleInit {
  private bot: Telegraf;

  constructor(
    private usersService: UsersService,
    private moviesService: MoviesService,
    private channelsService: ChannelsService,
    private stateService: StateService,
  ) {
    this.bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN!);
  }

  async onModuleInit() {
    await this.setupBot();
    await this.bot.launch();
    console.log('Telegram bot started successfully');
  }

  private async setupBot() {
    // Start command
    this.bot.start(async (ctx) => {
      const user = await this.usersService.findOrCreateUser(ctx.from);

      // Clear user state when /start is called
      if (ctx.from) {
        this.stateService.clearUserState(ctx.from.id);
      }

      if (await this.usersService.isSuperAdmin(user.telegramId)) {
        await ctx.reply('👋 Xush kelibsiz, Super Admin!', superAdminKeyboard());
      } else if (await this.usersService.isAdmin(user.telegramId)) {
        await ctx.reply('👋 Xush kelibsiz, Admin!', adminKeyboard());
      } else {
        await this.checkUserSubscription(ctx);
      }
    });

    // Handle text messages
    this.bot.on('text', async (ctx) => {
      if (!ctx.from) return;
      
      const text = ctx.message.text;
      const user = await this.usersService.findOrCreateUser(ctx.from);
      const state = this.stateService.getUserState(user.telegramId);

      // Handle admin commands first
      if (await this.usersService.isAdmin(user.telegramId)) {
        await this.handleAdminTextMessage(ctx, text, state);
        return;
      }

      // Handle regular user messages
      await this.handleUserTextMessage(ctx, text, state);
    });

    // Handle video messages
    this.bot.on('video', async (ctx) => {
      if (!ctx.from) return;

      const user = await this.usersService.findOrCreateUser(ctx.from);
      const state = this.stateService.getUserState(user.telegramId);

      if (await this.usersService.isAdmin(user.telegramId)) {
        if (state.step === BotStep.WAITING_FOR_MOVIE_FILE || state.step === BotStep.WAITING_FOR_MOVIE_INFO) {
          if (state.step === BotStep.WAITING_FOR_MOVIE_INFO) {
            // If video is sent directly without code and title
            const botUsername = (await ctx.telegram.getMe()).username;
            await ctx.reply(
              "Kino ma'lumotlarini kiriting:\n\n" +
              "KOD|NOMI|TAVSIF\n\n" +
              "Misol: ABC123|Kino nomi|Kino haqida"
            );
            
            // Save video info in state
            this.stateService.setTempData(ctx.from.id, {
              movieFile: {
                fileId: ctx.message.video.file_id,
                originalCaption: ctx.message.caption || '',
                filePath: ''
              }
            });
            return;
          }
          await this.handleVideoUpload(ctx, state, 'video');
        }
      }
    });

    // Handle forwarded messages
    this.bot.on('message', async (ctx) => {
      if (!ctx.from || !ctx.message || !('forward_from' in ctx.message || 'forward_from_chat' in ctx.message)) return;

      const user = await this.usersService.findOrCreateUser(ctx.from);
      const state = this.stateService.getUserState(user.telegramId);

      if (await this.usersService.isAdmin(user.telegramId)) {
        if ('video' in ctx.message && (state.step === BotStep.WAITING_FOR_MOVIE_FILE || state.step === BotStep.WAITING_FOR_MOVIE_INFO)) {
          if (state.step === BotStep.WAITING_FOR_MOVIE_INFO) {
            // If forwarded video is sent without code and title
            await ctx.reply(
              "Kino ma'lumotlarini kiriting:\n\n" +
              "KOD|NOMI|TAVSIF\n\n" +
              "Misol: ABC123|Kino nomi|Kino haqida"
            );
            
            // Save video info in state
            this.stateService.setTempData(ctx.from.id, {
              movieFile: {
                fileId: ctx.message.video.file_id,
                originalCaption: ctx.message.caption || '',
                filePath: ''
              }
            });
            return;
          }
          await this.handleVideoUpload(ctx, state, 'video');
        }
      }
    });

    // Handle photo messages
    this.bot.on('photo', async (ctx) => {
      if (!ctx.from) return;

      const user = await this.usersService.findOrCreateUser(ctx.from);
      const state = this.stateService.getUserState(user.telegramId);

      if (await this.usersService.isAdmin(user.telegramId)) {
        await this.handleMediaUpload(ctx, state, 'photo');
      }
    });

    // Handle animation (GIF) messages
    this.bot.on('animation', async (ctx) => {
      if (!ctx.from) return;

      const user = await this.usersService.findOrCreateUser(ctx.from);
      const state = this.stateService.getUserState(user.telegramId);

      if (await this.usersService.isAdmin(user.telegramId)) {
        await this.handleMediaUpload(ctx, state, 'animation');
      }
    });

    // Handle callback queries
    this.bot.on('callback_query', async (ctx) => {
      if (!ctx.from) return;

      if (ctx.callbackQuery && 'data' in ctx.callbackQuery) {
        const data = (ctx.callbackQuery as any).data;
        
        if (data === 'check_subscription') {
          await this.checkUserSubscription(ctx);
        }
      }
    });
  }

  private validateUrl(url: string): string | null {
    try {
      // Remove spaces from start and end
      url = url.trim();
      
      // Check if URL starts with http://, https://, or t.me/
      if (!url.startsWith('http://') && !url.startsWith('https://') && !url.startsWith('t.me/')) {
        // Add https:// to t.me links
        if (url.includes('t.me/')) {
          url = 'https://' + url;
        } else {
          return null;
        }
      }
      
      return url;
    } catch (error) {
      return null;
    }
  }

  private async handleAdminTextMessage(ctx: Context, text: string, state: any) {
    if (!ctx.from || !ctx.message) return;
    const isSuperAdmin = await this.usersService.isSuperAdmin(ctx.from.id);

    switch (text) {
      case '👥 Userlar soni':
        const userCount = await this.usersService.getUsersCount();
        await ctx.reply(`📊 Jami userlar soni: ${userCount}`);
        this.stateService.clearUserState(ctx.from.id);
        await ctx.reply('Tanlang:', isSuperAdmin ? superAdminKeyboard() : adminKeyboard());
        break;

      case "🎬 Kino qo'shish":
        await ctx.reply("Video faylini yuboring yoki forward qiling");
        this.stateService.setUserStep(ctx.from.id, BotStep.WAITING_FOR_MOVIE_FILE);
        break;

      case "🗑 Kino o'chirish":
        await ctx.reply("O'chirmoqchi bo'lgan kino kodini yuboring:");
        this.stateService.setUserStep(ctx.from.id, BotStep.WAITING_FOR_MOVIE_CODE_TO_DELETE);
        break;

      case "📺 Kanal qo'shish":
        await ctx.reply("Kanal ma'lumotlarini quyidagi formatda yuboring:\n\n" +
          "KANAL_ID|NOMI|INVITE_LINK\n\n" +
          "Misol:\n" +
          "Ochiq kanal uchun:\n" +
          "-1001234567890|@mychannel|My Channel|t.me/mychannel\n\n" +
          "Yopiq kanal uchun:\n" +
          "-1001234567890|My Channel|t.me/joinchat/abcdef123456\n\n" +
          "⚠️ Eslatma:\n" +
          "- KANAL_ID - majburiy\n" +
          "- NOMI - majburiy\n" +
          "- INVITE_LINK - majburiy (yopiq kanal uchun to'liq invite link)");
        this.stateService.setUserStep(ctx.from.id, BotStep.WAITING_FOR_CHANNEL_INFO);
        break;

      case "❌ Kanal o'chirish":
        await ctx.reply("O'chirmoqchi bo'lgan kanal ID sini yuboring:");
        this.stateService.setUserStep(ctx.from.id, BotStep.WAITING_FOR_CHANNEL_ID_TO_DELETE);
        break;

      case '📢 Reklama yuborish':
        this.stateService.setTempData(ctx.from.id, { adData: {} as AdState });
        await ctx.reply(
          "Forward qilib yuboring yoki media yuboring.\n" +
          "Qo'llab quvvatlanadigan formatlar:\n" +
          "- Rasm\n" +
          "- Video\n" +
          "- GIF\n" +
          "- Dumaloq video"
        );
        this.stateService.setUserStep(ctx.from.id, BotStep.WAITING_FOR_AD_MESSAGE);
        break;

      case '💬 Xabar yuborish':
        await ctx.reply(
          "Barcha foydalanuvchilarga yubormoqchi bo'lgan oddiy xabaringizni yuboring.\n" +
          "⚠️ Faqat matn yuborish mumkin!"
        );
        this.stateService.setUserStep(ctx.from.id, BotStep.WAITING_FOR_BROADCAST_MESSAGE);
        break;

      case "👨‍💼 Admin qo'shish":
        if (!isSuperAdmin) {
          await ctx.reply("❌ Bu funksiya faqat super admin uchun!");
          return;
        }
        await ctx.reply("Yangi admin ID raqamini yuboring:");
        this.stateService.setUserStep(ctx.from.id, BotStep.WAITING_FOR_ADMIN_ID_TO_ADD);
        break;

      case "🗑 Admin o'chirish":
        if (!isSuperAdmin) {
          await ctx.reply("❌ Bu funksiya faqat super admin uchun!");
          return;
        }
        await ctx.reply("O'chirmoqchi bo'lgan admin ID raqamini yuboring:");
        this.stateService.setUserStep(ctx.from.id, BotStep.WAITING_FOR_ADMIN_ID_TO_REMOVE);
        break;

      case "✅ Ha, tugma qo'shish":
        if (state.step === BotStep.WAITING_FOR_BUTTON_CHOICE) {
          await ctx.reply(
            "Tugma uchun URL manzilini kiriting:\n" +
            "Misol: https://example.com"
          );
          this.stateService.setUserStep(ctx.from.id, BotStep.WAITING_FOR_BUTTON_URL);
        }
        break;

      case "❌ Yo'q, tugmasiz":
        if (state.step === BotStep.WAITING_FOR_BUTTON_CHOICE) {
          const adData = state.tempData.adData as AdState;
          await this.sendAdToUsers(ctx, adData);
        }
        break;

      case "✅ Mavjud yozuvdan foydalanish":
        if (state.step === BotStep.WAITING_FOR_CAPTION_CHOICE) {
          const { movieFile } = state.tempData;
          await ctx.reply("Kino kodini kiriting:");
          this.stateService.setTempData(ctx.from.id, {
            movieFile,
            selectedCaption: movieFile.originalCaption
          });
          this.stateService.setUserStep(ctx.from.id, BotStep.WAITING_FOR_MOVIE_CODE);
        }
        break;

      case "📝 Yangi yozuv qo'shish":
        if (state.step === BotStep.WAITING_FOR_CAPTION_CHOICE) {
          await ctx.reply("Yangi yozuvni kiriting:");
          this.stateService.setUserStep(ctx.from.id, BotStep.WAITING_FOR_NEW_CAPTION);
        }
        break;

      case "❌ Yozuv qo'shmaslik":
        if (state.step === BotStep.WAITING_FOR_CAPTION_CHOICE) {
          const { movieFile } = state.tempData;
          await ctx.reply("Kino kodini kiriting:");
          this.stateService.setTempData(ctx.from.id, {
            movieFile,
            selectedCaption: ''
          });
          this.stateService.setUserStep(ctx.from.id, BotStep.WAITING_FOR_MOVIE_CODE);
        }
        break;

      default:
        if (state.step === BotStep.WAITING_FOR_NEW_CAPTION) {
          const { movieFile } = state.tempData;
          this.stateService.setTempData(ctx.from.id, {
            movieFile,
            selectedCaption: text
          });
          await ctx.reply("Kino kodini kiriting:");
          this.stateService.setUserStep(ctx.from.id, BotStep.WAITING_FOR_MOVIE_CODE);
        }
        else if (state.step === BotStep.WAITING_FOR_MOVIE_CODE) {
          const { movieFile, selectedCaption } = state.tempData;
          this.stateService.setTempData(ctx.from.id, {
            movieFile,
            selectedCaption,
            movieCode: text
          });
          await ctx.reply("Kino nomini kiriting:");
          this.stateService.setUserStep(ctx.from.id, BotStep.WAITING_FOR_MOVIE_TITLE);
        }
        else if (state.step === BotStep.WAITING_FOR_MOVIE_TITLE) {
          const { movieFile, selectedCaption, movieCode } = state.tempData;
          const botUsername = (await ctx.telegram.getMe()).username;
          const finalDescription = selectedCaption ? 
            `${selectedCaption}\n\n@${botUsername}` : 
            `@${botUsername}`;

          try {
            await this.moviesService.createMovie({
              code: movieCode,
              title: text,
              description: finalDescription,
              fileId: movieFile.fileId,
              filePath: ''
            });
            await ctx.reply('✅ Kino muvaffaqiyatli qoʻshildi!');
          } catch (error) {
            console.error('Error saving movie:', error);
            await ctx.reply('❌ Xatolik yuz berdi. Qaytadan urinib koʻring.');
          }

          this.stateService.clearUserState(ctx.from.id);
          await ctx.reply('Tanlang:', isSuperAdmin ? superAdminKeyboard() : adminKeyboard());
        }
        else if (state.step === BotStep.WAITING_FOR_MOVIE_CODE_TO_DELETE) {
          const success = await this.moviesService.deleteMovie(text);
          if (success) {
            await ctx.reply('✅ Kino muvaffaqiyatli oʻchirildi!');
          } else {
            await ctx.reply('❌ Bunday kodli kino topilmadi!');
          }
          this.stateService.clearUserState(ctx.from.id);
          await ctx.reply('Tanlang:', isSuperAdmin ? superAdminKeyboard() : adminKeyboard());
        }
        else if (state.step === BotStep.WAITING_FOR_CHANNEL_INFO) {
          const [channelId, name, inviteLink] = text.split('|').map(item => item.trim());
          if (!channelId || !name || !inviteLink) {
            await ctx.reply("Noto'g'ri format. Qaytadan urinib ko'ring:\n\n" +
              "KANAL_ID|NOMI|INVITE_LINK\n\n" +
              "Barcha maydonlar majburiy!");
            return;
          }

          try {
            await this.channelsService.createChannel({
              channelId,
              name,
              inviteLink
            });
            await ctx.reply('✅ Kanal muvaffaqiyatli qoʻshildi!');
          } catch (error) {
            console.error('Error adding channel:', error);
            await ctx.reply('❌ Xatolik yuz berdi. Qaytadan urinib koʻring.');
          }
          this.stateService.clearUserState(ctx.from.id);
          await ctx.reply('Tanlang:', isSuperAdmin ? superAdminKeyboard() : adminKeyboard());
        }
        else if (state.step === BotStep.WAITING_FOR_CHANNEL_ID_TO_DELETE) {
          try {
            const success = await this.channelsService.deleteChannel(text);
            if (success) {
              await ctx.reply('✅ Kanal muvaffaqiyatli oʻchirildi!');
            } else {
              await ctx.reply('❌ Bunday ID li kanal topilmadi!');
            }
          } catch (error) {
            console.error('Error deleting channel:', error);
            await ctx.reply('❌ Xatolik yuz berdi. Qaytadan urinib koʻring.');
          }
          this.stateService.clearUserState(ctx.from.id);
          await ctx.reply('Tanlang:', isSuperAdmin ? superAdminKeyboard() : adminKeyboard());
        }
        else if (state.step === BotStep.WAITING_FOR_BUTTON_URL) {
          const url = this.validateUrl(text);
          if (!url) {
            await ctx.reply('❌ Noto\'g\'ri URL formati. URL https:// bilan boshlanishi kerak.');
            return;
          }

          const adData = state.tempData.adData as AdState;
          const buttons = [[Markup.button.url('Batafsil', url)]];
          await this.sendAdToUsers(ctx, adData, buttons);
        }
        else if (state.step === BotStep.WAITING_FOR_ADMIN_ID_TO_ADD) {
          try {
            const adminId = Number(text);
            if (isNaN(adminId)) {
              await ctx.reply('❌ Noto\'g\'ri format. ID raqam bo\'lishi kerak.');
              return;
            }
            
            const success = await this.usersService.addAdmin(adminId);
            if (success) {
              await ctx.reply('✅ Admin muvaffaqiyatli qo\'shildi!');
            } else {
              await ctx.reply('❌ Bunday foydalanuvchi topilmadi yoki allaqachon admin!');
            }
          } catch (error) {
            console.error('Error adding admin:', error);
            await ctx.reply('❌ Xatolik yuz berdi. Qaytadan urinib ko\'ring.');
          }
          this.stateService.clearUserState(ctx.from.id);
          await ctx.reply('Tanlang:', isSuperAdmin ? superAdminKeyboard() : adminKeyboard());
        }
        else if (state.step === BotStep.WAITING_FOR_ADMIN_ID_TO_REMOVE) {
          try {
            const adminId = Number(text);
            if (isNaN(adminId)) {
              await ctx.reply('❌ Noto\'g\'ri format. ID raqam bo\'lishi kerak.');
              return;
            }
            
            const success = await this.usersService.removeAdmin(adminId);
            if (success) {
              await ctx.reply('✅ Admin muvaffaqiyatli o\'chirildi!');
            } else {
              await ctx.reply('❌ Bunday admin topilmadi!');
            }
          } catch (error) {
            console.error('Error removing admin:', error);
            await ctx.reply('❌ Xatolik yuz berdi. Qaytadan urinib ko\'ring.');
          }
          this.stateService.clearUserState(ctx.from.id);
          await ctx.reply('Tanlang:', isSuperAdmin ? superAdminKeyboard() : adminKeyboard());
        }
        else if (state.step === BotStep.WAITING_FOR_BROADCAST_MESSAGE) {
          try {
            await this.sendMessageToAll(text);
            await ctx.reply('✅ Xabar barcha foydalanuvchilarga yuborildi!');
          } catch (error) {
            console.error('Error broadcasting message:', error);
            await ctx.reply('❌ Xatolik yuz berdi. Qaytadan urinib ko\'ring.');
          }
          this.stateService.clearUserState(ctx.from.id);
          await ctx.reply('Tanlang:', isSuperAdmin ? superAdminKeyboard() : adminKeyboard());
        }
        break;
    }
  }

  private async handleVideoUpload(ctx: Context, state: any, mediaType: string) {
    if (!ctx.from || !ctx.message || !('video' in ctx.message)) return;

    if (state.step === BotStep.WAITING_FOR_MOVIE_FILE) {
      const video = ctx.message.video;
      const originalCaption = ctx.message.caption;

      try {
        this.stateService.setTempData(ctx.from.id, {
          movieFile: {
            fileId: video.file_id,
            originalCaption,
            filePath: ''
          }
        });

        await ctx.reply(
          "Videodagi yozuv bilan nima qilmoqchisiz?",
          Markup.keyboard([
            ["✅ Mavjud yozuvdan foydalanish"],
            ["📝 Yangi yozuv qo'shish"],
            ["❌ Yozuv qo'shmaslik"]
          ]).oneTime().resize()
        );
        this.stateService.setUserStep(ctx.from.id, BotStep.WAITING_FOR_CAPTION_CHOICE);
      } catch (error) {
        console.error('Error handling video:', error);
        await ctx.reply('❌ Xatolik yuz berdi. Qaytadan urinib koʻring.');
        this.stateService.clearUserState(ctx.from.id);
      }
    }
  }

  private async handleUserTextMessage(ctx: Context, text: string, state: any) {
    if (!ctx.from) return;

    // Check subscription first
    const isSubscribed = await this.checkAllSubscriptions(ctx.from.id);
    if (!isSubscribed) {
      await this.checkUserSubscription(ctx);
      return;
    }

    // Handle movie code request
    try {
      const movie = await this.moviesService.getMovieByCode(text.trim().toLowerCase());
      if (movie) {
        await ctx.replyWithVideo(movie.fileId, {
          caption: `${movie.description || ''}\n\n📥 Yuklab olishlar: ${movie.downloadCount}`,
        });
        await this.moviesService.incrementDownloadCount(text, ctx.from.id);
      } else {
        await ctx.reply('❌ Bunday kodli kino topilmadi!');
      }
    } catch (error) {
      console.error('Error sending movie:', error);
      await ctx.reply('❌ Xatolik yuz berdi. Iltimos qaytadan urinib ko\'ring.');
    }
  }

  private async checkUserSubscription(ctx: Context) {
    const channels = await this.channelsService.getAllActiveChannels();
    if (!ctx.from) return;

    if (channels.length === 0) {
      await ctx.reply('🎬 Kino kodini yuboring:');
      return;
    }

    const unsubscribedChannels: string[] = [];

    for (const channel of channels) {
      try {
        const member = await this.bot.telegram.getChatMember(channel.channelId, ctx.from.id);
        if (!['member', 'administrator', 'creator'].includes(member.status)) {
          unsubscribedChannels.push(channel.channelId);
        }
      } catch (error) {
        unsubscribedChannels.push(channel.channelId);
      }
    }

    // Delete previous subscription check message if exists
    if ('callback_query' in ctx.update && ctx.update.callback_query?.message) {
      try {
        await ctx.deleteMessage();
      } catch (error) {
        console.error('Error deleting message:', error);
      }
    }

    if (unsubscribedChannels.length > 0) {
      await ctx.reply(
        "📺 Botdan foydalanish uchun quyidagi kanallarga obuna bo'ling:",
        createSubscriptionKeyboard(channels, unsubscribedChannels),
      );
    } else {
      await ctx.reply("🎬 Kino kodini yuboring:");
    }
  }

  private async checkAllSubscriptions(userId: number): Promise<boolean> {
    const channels = await this.channelsService.getAllActiveChannels();

    for (const channel of channels) {
      try {
        const member = await this.bot.telegram.getChatMember(channel.channelId, userId);
        if (!['member', 'administrator', 'creator'].includes(member.status)) {
          return false;
        }
      } catch (error) {
        return false;
      }
    }

    return true;
  }

  async sendMessageToAll(message: string) {
    const users = await this.usersService.getAllUsers();

    for (const user of users) {
      try {
        await this.bot.telegram.sendMessage(user.telegramId, message);
        await new Promise((resolve) => setTimeout(resolve, 50));
      } catch (error) {
        console.log(`Failed to send message to user ${user.telegramId}`);
      }
    }
  }

  private async handleMediaUpload(ctx: Context, state: any, mediaType: 'photo' | 'video' | 'animation') {
    if (!ctx.from || !ctx.message) return;

    if (state.step === BotStep.WAITING_FOR_AD_MESSAGE) {
      let mediaId: string | undefined;
      let caption: string | undefined;
      // @ts-ignore
      const msg = ctx.message;
      
      try {
        switch (mediaType) {
          case 'photo':
            if ('photo' in msg && msg.photo && msg.photo.length > 0) {
              mediaId = msg.photo[msg.photo.length - 1].file_id;
              caption = msg.caption;
            }
            break;
          case 'video':
            if ('video' in msg && msg.video) {
              mediaId = msg.video.file_id;
              caption = msg.caption;
            }
            break;
          case 'animation':
            if ('animation' in msg && msg.animation) {
              mediaId = msg.animation.file_id;
              caption = msg.caption;
            }
            break;
        }

        if (!mediaId) {
          await ctx.reply('❌ Media fayli topilmadi. Qaytadan urinib ko\'ring.');
          return;
        }

        // Save media info to state
        this.stateService.setTempData(ctx.from.id, {
          adData: {
            mediaId,
            mediaType,
            caption: caption || ''
          }
        });

        await ctx.reply(
          "Tugma qo'shishni xohlaysizmi?",
          Markup.keyboard([
            ["✅ Ha, tugma qo'shish"],
            ["❌ Yo'q, tugmasiz"]
          ]).oneTime().resize()
        );
        this.stateService.setUserStep(ctx.from.id, BotStep.WAITING_FOR_BUTTON_CHOICE);
      } catch (error) {
        console.error('Error handling media upload:', error);
        await ctx.reply('❌ Xatolik yuz berdi. Qaytadan urinib ko\'ring.');
        this.stateService.clearUserState(ctx.from.id);
      }
    }
  }

  private async sendAdToUsers(ctx: Context, adData: AdState, inlineButtons?: UrlButton[][]) {
    if (!ctx.from || !adData.mediaId) return;
    const isSuperAdmin = await this.usersService.isSuperAdmin(ctx.from.id);

    try {
      // @ts-ignore
      const mediaOptions = {
        caption: adData.caption || '',
        parse_mode: 'HTML' as const,
        ...(inlineButtons && { reply_markup: { inline_keyboard: inlineButtons } })
      };

      // Send preview
      await ctx.reply('📤 Oldin sizga reklama ko\'rinishini yuboraman...');
      
      switch (adData.mediaType) {
        case 'photo':
          // @ts-ignore
          await ctx.replyWithPhoto(adData.mediaId, mediaOptions);
          break;
        case 'video':
          // @ts-ignore
          await ctx.replyWithVideo(adData.mediaId, mediaOptions);
          break;
        case 'animation':
          // @ts-ignore
          await ctx.replyWithAnimation(adData.mediaId, mediaOptions);
          break;
      }

      await ctx.reply('📤 Reklama yuborish boshlanmoqda...');

      // Send to all users
      const users = await this.usersService.getAllUsers();
      let successCount = 0;
      let failCount = 0;

      for (const user of users) {
        try {
          switch (adData.mediaType) {
            case 'photo':
              // @ts-ignore
              await this.bot.telegram.sendPhoto(user.telegramId, adData.mediaId, mediaOptions);
              break;
            case 'video':
              // @ts-ignore
              await this.bot.telegram.sendVideo(user.telegramId, adData.mediaId, mediaOptions);
              break;
            case 'animation':
              // @ts-ignore
              await this.bot.telegram.sendAnimation(user.telegramId, adData.mediaId, mediaOptions);
              break;
          }
          successCount++;
          await new Promise(resolve => setTimeout(resolve, 50));
        } catch (error) {
          console.error(`Error sending ad to user ${user.telegramId}:`, error);
          failCount++;
        }
      }

      await ctx.reply(
        `✅ Reklama yuborish yakunlandi!\n\n` +
        `📨 Yuborildi: ${successCount} ta\n` +
        `❌ Yuborilmadi: ${failCount} ta`
      );
    } catch (error) {
      console.error('Error sending ad:', error);
      await ctx.reply('❌ Xatolik yuz berdi. Qaytadan urinib ko\'ring.');
    }

    this.stateService.clearUserState(ctx.from.id);
    await ctx.reply('Tanlang:', isSuperAdmin ? superAdminKeyboard() : adminKeyboard());
  }
}