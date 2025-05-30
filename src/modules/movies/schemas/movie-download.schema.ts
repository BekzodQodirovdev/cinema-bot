import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema()
export class MovieDownload extends Document {
  @Prop({ required: true })
  userId: number;

  @Prop({ required: true })
  movieCode: string;

  @Prop({ required: true })
  downloadedAt: Date;
}

export const MovieDownloadSchema = SchemaFactory.createForClass(MovieDownload); 