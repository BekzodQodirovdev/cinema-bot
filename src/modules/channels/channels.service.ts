import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Channel } from './schemas/channel.schema';

@Injectable()
export class ChannelsService {
  constructor(
    @InjectModel('Channel') private channelModel: Model<Channel>
  ) {}

  async createChannel(channelData: {
    channelId: string;
    name: string;
    inviteLink: string;
  }): Promise<Channel> {
    const channel = new this.channelModel({
      ...channelData,
      isActive: true,
      createdAt: new Date()
    });
    return channel.save();
  }

  async getAllActiveChannels(): Promise<Channel[]> {
    return this.channelModel.find({ isActive: true }).exec();
  }

  async deleteChannel(channelId: string): Promise<boolean> {
    const result = await this.channelModel.findOneAndDelete({ channelId });
    return !!result;
  }

  async getChannelById(channelId: string): Promise<Channel | null> {
    return this.channelModel.findOne({ channelId, isActive: true });
  }
}