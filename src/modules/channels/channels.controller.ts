import { Controller, Get, Post, Delete, Body, Param, UseGuards } from '@nestjs/common';
import { ChannelsService } from './channels.service';
import { RoleGuard } from '../auth/guards/role.guard';
import { UserRole } from '../../common/enums/user-role.enum';

@Controller('channels')
export class ChannelsController {
  constructor(private readonly channelsService: ChannelsService) {}

  @Post()
  @UseGuards(new RoleGuard([UserRole.ADMIN, UserRole.SUPER_ADMIN]))
  async addChannel(@Body() channelData: {
    channelId: string;
    username: string;
    name: string;
    inviteLink: string;
  }) {
    const channel = await this.channelsService.createChannel(channelData);
    return { message: 'Channel added successfully', channel };
  }

  @Get()
  async getAllChannels() {
    const channels = await this.channelsService.getAllActiveChannels();
    return { channels };
  }

  @Get(':channelId')
  async getChannelById(@Param('channelId') channelId: string) {
    const channel = await this.channelsService.getChannelById(channelId);
    return { channel };
  }

  @Delete(':channelId')
  @UseGuards(new RoleGuard([UserRole.ADMIN, UserRole.SUPER_ADMIN]))
  async deleteChannel(@Param('channelId') channelId: string) {
    const success = await this.channelsService.deleteChannel(channelId);
    return { 
      message: success ? 'Channel deleted successfully' : 'Channel not found',
      success 
    };
  }
}