import { Controller, Post, Body, UseGuards, Param } from '@nestjs/common';
import { TelegramService } from './telegram.service';
import { RoleGuard } from '../auth/guards/role.guard';
import { UserRole } from '../../common/enums/user-role.enum';

@Controller()
export class TelegramController {
  constructor(private readonly telegramService: TelegramService) {}

  @Post('broadcast')
  @UseGuards(new RoleGuard([UserRole.ADMIN, UserRole.SUPER_ADMIN]))
  async broadcastMessage(@Body() data: { message: string }) {
    await this.telegramService.sendMessageToAll(data.message);
    return { message: 'Broadcast message sent successfully' };
  }

  @Post('advertisement')
  @UseGuards(new RoleGuard([UserRole.ADMIN, UserRole.SUPER_ADMIN]))
  async sendAdvertisement(@Body() data: { message: string }) {
    await this.telegramService.sendMessageToAll(`📢 REKLAMA:\n\n${data.message}`);
    return { message: 'Advertisement sent successfully' };
  }

  @Post('webhook/:token')
  async handleWebhook(@Param('token') token: string, @Body() update: any) {
    // Verify token
    if (token !== process.env.TELEGRAM_BOT_TOKEN) {
      return { status: 'error', message: 'Invalid token' };
    }

    // Handle the update
    await this.telegramService.handleUpdate(update);
    return { status: 'ok' };
  }
}