import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import { TelegramService } from './telegram.service';
import { RoleGuard } from '../auth/guards/role.guard';
import { UserRole } from '../../common/enums/user-role.enum';

@Controller('telegram')
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
}