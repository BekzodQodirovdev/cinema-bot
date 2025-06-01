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
import { UserRole } from '../../common/enums/user-role.enum';

interface UrlButton {
  text: string;
  url: string;
}

interface AdState {
  mediaId?: string;
  mediaType?: 'photo' | 'video';
  caption?: string;
}

interface SendMessageOptions extends ExtraReplyMessage {
  caption?: string;
  parse_mode?: 'HTML';
  reply_markup?: {
    inline_keyboard: UrlButton[][];
  };
}

interface BotState {
  step: BotStep;
  tempData?: any;
  page?: number;
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

    // Handle photo messages
    this.bot.on('photo', async (ctx) => {
      if (!ctx.from) return;
      console.log('Received photo message');

      const user = await this.usersService.findOrCreateUser(ctx.from);
      const state = this.stateService.getUserState(user.telegramId);
      console.log('User state for photo:', state);

      if (await this.usersService.isAdmin(user.telegramId)) {
        await this.handleMediaUpload(ctx, state, 'photo');
      }
    });

    // Handle video messages
    this.bot.on('video', async (ctx) => {
      if (!ctx.from) return;
      console.log('Received video message');

      const user = await this.usersService.findOrCreateUser(ctx.from);
      const state = this.stateService.getUserState(user.telegramId);
      console.log('User state for video:', state);

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
        } else {
          await this.handleMediaUpload(ctx, state, 'video');
        }
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

    console.log('Admin text handler - Current state:', state);
    console.log('Received text:', text);

    switch (text) {
      case '👥 Userlar soni':
        const userCount = await this.usersService.getUsersCount();
        await ctx.reply(`📊 Jami userlar soni: ${userCount}`);
        this.stateService.clearUserState(ctx.from.id);
        await ctx.reply('Tanlang:', isSuperAdmin ? superAdminKeyboard() : adminKeyboard());
        break;

      case '👨‍💼 Adminlar':
        const admins = await this.usersService.getAllAdmins();
        const regularAdmins = admins.filter(admin => admin.role === UserRole.ADMIN);
        if (regularAdmins.length === 0) {
          await ctx.reply('❌ Hozircha adminlar mavjud emas.');
        } else {
          const adminList = regularAdmins.map(admin => {
            console.log(admin)
            const displayName = `${admin.username} ${admin.firstName}${admin.lastName ? ' ' + admin.lastName : ''} - <code>${admin.telegramId}</code>`;
            return `👨‍💼 Admin: @${displayName}`;
          }).join('\n');
          await ctx.reply(`📋 Adminlar ro'yxati:\n\n${adminList}`, {parse_mode: "HTML"});
        }
        this.stateService.clearUserState(ctx.from.id);
        await ctx.reply('Tanlang:', isSuperAdmin ? superAdminKeyboard() : adminKeyboard());
        break;

      case '📺 Kanallar':
        const channels = await this.channelsService.getAllActiveChannels();
        if (channels.length === 0) {
          await ctx.reply('❌ Hozircha kanallar mavjud emas.');
        } else {
          const channelList = channels.map(channel => {
            const channelUsername = channel.name.startsWith('@') ? channel.name : '';
            return `📺 Kanal: <code>${channel.channelId}</code> - ${channelUsername} | ${channel.inviteLink}`;
          }).join('\n\n');
          await ctx.reply(`📋 Kanallar ro'yxati:\n\n${channelList}`, { parse_mode: 'HTML' });
        }
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
          "-1001234567890|My Channel|https://t.me/+dasffsafadasdas\n\n" +
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
        await ctx.reply(
          "Reklama turini tanlang:",
          Markup.keyboard([
            ['🖼 Rasm'],
            ['🎥 Video'],
            ['🏠 Bosh sahifa']
          ]).oneTime().resize()
        );
        this.stateService.setUserStep(ctx.from.id, BotStep.WAITING_FOR_AD_TYPE);
        break;

      case '🏠 Bosh sahifa':
        this.stateService.clearUserState(ctx.from.id);
        await ctx.reply('Tanlang:', isSuperAdmin ? superAdminKeyboard() : adminKeyboard());
        break;

      case '🖼 Rasm':
      case '🎥 Video':
        if (state.step === BotStep.WAITING_FOR_AD_TYPE) {
          const mediaType = text === '🖼 Rasm' ? 'photo' : 'video';
          this.stateService.setTempData(ctx.from.id, { 
            adData: { mediaType } as AdState 
          });
          await ctx.reply("Media faylini yuboring:");
          this.stateService.setUserStep(ctx.from.id, BotStep.WAITING_FOR_AD_MEDIA);
        }
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

      case '📋 Kinolar':
        await this.showMoviesList(ctx, 1);
        this.stateService.setUserStep(ctx.from.id, BotStep.VIEWING_MOVIES);
        break;

      case '⬅️ Oldingi':
        if (state.step === BotStep.VIEWING_MOVIES) {
          const currentPage = state.page || 1;
          if (currentPage > 1) {
            await this.showMoviesList(ctx, currentPage - 1);
          }
        }
        break;

      case '➡️ Keyingi':
        if (state.step === BotStep.VIEWING_MOVIES) {
          const currentPage = state.page || 1;
          const totalMovies = await this.moviesService.getMoviesCount();
          const totalPages = Math.ceil(totalMovies / 10);
          
          if (currentPage < totalPages) {
            await this.showMoviesList(ctx, currentPage + 1);
          }
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
        else if (state.step === BotStep.WAITING_FOR_AD_TEXT) {
          const adData = state.tempData.adData as AdState;
          this.stateService.setTempData(ctx.from.id, {
            adData: {
              ...adData,
              caption: text
            }
          });
          await ctx.reply(
            "Tugma qo'shish uchun quyidagi formatda yuboring yoki \"Yo'q\" deb yozing:\n\n" +
            "BUTTON|Tugma nomi|https://example.com\n\n" +
            "Misol: BUTTON|Batafsil|https://t.me/channel"
          );
          this.stateService.setUserStep(ctx.from.id, BotStep.WAITING_FOR_AD_BUTTON);
        }
        else if (state.step === BotStep.WAITING_FOR_AD_BUTTON) {
          const adData = state.tempData.adData as AdState;
          if (text.toLowerCase() === "yo'q") {
            await this.sendAdToUsers(ctx, adData);
          } else {
            const parts = text.split('|');
            if (parts.length !== 3 || parts[0].trim() !== 'BUTTON') {
              await ctx.reply(
                "❌ Noto'g'ri format. Qaytadan urinib ko'ring:\n\n" +
                "BUTTON|Tugma nomi|https://example.com\n\n" +
                "yoki \"Yo'q\" deb yozing"
              );
              return;
            }
            const buttonName = parts[1].trim();
            const buttonUrl = this.validateUrl(parts[2].trim());
            if (!buttonUrl) {
              await ctx.reply('❌ Noto\'g\'ri URL formati. URL https:// yoki t.me/ bilan boshlanishi kerak.');
              return;
            }
            const buttons = [[Markup.button.url(buttonName, buttonUrl)]];
            await this.sendAdToUsers(ctx, adData, buttons);
          }
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

  private async handleMediaUpload(ctx: Context, state: any, mediaType: 'photo' | 'video') {
    if (!ctx.from || !ctx.message) return;

    console.log('handleMediaUpload called');
    console.log('Current state:', state);
    console.log('Media type:', mediaType);
    console.log('Message:', ctx.message);

    // Check if we're waiting for media
    if (state.step !== BotStep.WAITING_FOR_AD_MEDIA) {
      console.log('Not waiting for media, current step:', state.step);
      return;
    }

    let mediaId: string | undefined;
    // @ts-ignore
    const msg = ctx.message;
    
    try {
      // Check if the media type matches what was selected
      const expectedType = state.tempData?.adData?.mediaType;
      console.log('Expected media type:', expectedType);
      console.log('Received media type:', mediaType);

      if (mediaType !== expectedType) {
        const mediaTypeText = {
          photo: 'rasm',
          video: 'video'
        }[expectedType || ''];
        await ctx.reply(`❌ Iltimos, ${mediaTypeText} yuboring.`);
        return;
      }

      switch (mediaType) {
        case 'photo':
          if ('photo' in msg && msg.photo && msg.photo.length > 0) {
            mediaId = msg.photo[msg.photo.length - 1].file_id;
            console.log('Got photo ID:', mediaId);
          }
          break;
        case 'video':
          if ('video' in msg && msg.video) {
            mediaId = msg.video.file_id;
            console.log('Got video ID:', mediaId);
          }
          break;
      }

      if (!mediaId) {
        console.log('No media ID found');
        await ctx.reply('❌ Media fayli topilmadi. Qaytadan urinib ko\'ring.');
        return;
      }

      // Save media info to state
      const currentData = state.tempData?.adData || {};
      console.log('Current ad data before update:', currentData);
      
      this.stateService.setTempData(ctx.from.id, {
        adData: {
          ...currentData,
          mediaId,
          mediaType: expectedType
        }
      });

      console.log('State updated with media');
      await ctx.reply("Reklama matnini kiriting:");
      this.stateService.setUserStep(ctx.from.id, BotStep.WAITING_FOR_AD_TEXT);
    } catch (error) {
      console.error('Error in handleMediaUpload:', error);
      await ctx.reply('❌ Xatolik yuz berdi. Qaytadan urinib ko\'ring.');
      this.stateService.clearUserState(ctx.from.id);
      const isSuperAdmin = await this.usersService.isSuperAdmin(ctx.from.id);
      await ctx.reply('Tanlang:', isSuperAdmin ? superAdminKeyboard() : adminKeyboard());
    }
  }

  private async sendAdToUsers(ctx: Context, adData: AdState, inlineButtons?: UrlButton[][]) {
    if (!ctx.from) return;
    
    console.log('Sending ad with data:', adData);
    console.log('Buttons:', inlineButtons);

    if (!adData.mediaId || !adData.mediaType) {
      await ctx.reply('❌ Xatolik: Media topilmadi');
      return;
    }

    const isSuperAdmin = await this.usersService.isSuperAdmin(ctx.from.id);

    try {
      const mediaOptions = {
        caption: adData.caption || '',
        parse_mode: 'HTML' as const,
        ...(inlineButtons && { reply_markup: { inline_keyboard: inlineButtons } })
      };

      // Send preview
      await ctx.reply('📤 Oldin sizga reklama ko\'rinishini yuboraman...');
      
      switch (adData.mediaType) {
        case 'photo':
          await ctx.replyWithPhoto(adData.mediaId, mediaOptions);
          break;
        case 'video':
          await ctx.replyWithVideo(adData.mediaId, mediaOptions);
          break;
      }

      await ctx.reply('📤 Reklama yuborish boshlanmoqda...');

      // Send to all users
      const users = await this.usersService.getAllUsers();
      console.log(`Sending ad to ${users.length} users`);
      
      let successCount = 0;
      let failCount = 0;

      for (const user of users) {
        try {
          switch (adData.mediaType) {
            case 'photo':
              await this.bot.telegram.sendPhoto(user.telegramId, adData.mediaId, mediaOptions);
              break;
            case 'video':
              await this.bot.telegram.sendVideo(user.telegramId, adData.mediaId, mediaOptions);
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
      console.error('Error in sendAdToUsers:', error);
      await ctx.reply('❌ Xatolik yuz berdi. Qaytadan urinib ko\'ring.');
    }

    this.stateService.clearUserState(ctx.from.id);
    await ctx.reply('Tanlang:', isSuperAdmin ? superAdminKeyboard() : adminKeyboard());
  }

  private async showMoviesList(ctx: Context, page: number) {
    if (!ctx.from) return;

    const skip = (page - 1) * 10;
    const movies = await this.moviesService.getMovies(skip, 10);
    const totalMovies = await this.moviesService.getMoviesCount();
    const totalPages = Math.ceil(totalMovies / 10);

    if (movies.length === 0) {
        await ctx.reply('❌ Kinolar topilmadi.');
        return;
    }

    const moviesList = movies.map(movie => {
        return `<code>${movie.code}</code> - ${movie.title}`;
    }).join('\n');

    const message = `📋 Kinolar ro'yxati (${page}/${totalPages}):\n\n${moviesList}`;

    const keyboard: Array<Array<string>> = [];
    const row: Array<string> = [];
    if (page > 1) {
        row.push('⬅️ Oldingi');
    }
    if (page < totalPages) {
        row.push('➡️ Keyingi');
    }
    row.push('🏠 Bosh sahifa');
    keyboard.push(row);

    await ctx.reply(message, {
        parse_mode: 'HTML',
        reply_markup: {
            keyboard: keyboard,
            resize_keyboard: true,
            one_time_keyboard: true
        }
    });

    // Save current page in state
    this.stateService.setTempData(ctx.from.id, { page });
  }
}