import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema()
export class Channel extends Document {
  @Prop({ required: true, unique: true })
  channelId: string;

  @Prop({ required: true })
  name: string;

  @Prop({ required: true })
  inviteLink: string;

  @Prop({ default: true })
  isActive: boolean;

  @Prop({ required: true })
  createdAt: Date;
}

export const ChannelSchema = SchemaFactory.createForClass(Channel);