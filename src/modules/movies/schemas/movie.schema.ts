import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema()
export class Movie extends Document {
  @Prop({ required: true, unique: true })
  code: string;

  @Prop({ required: true })
  title: string;

  @Prop()
  description: string;

  @Prop({ required: true })
  fileId: string;

  @Prop()
  filePath: string;

  @Prop({ default: 0 })
  downloadCount: number;

  @Prop({ required: true })
  createdAt: Date;

  @Prop({ default: true })
  isActive: boolean;
}

export const MovieSchema = SchemaFactory.createForClass(Movie);