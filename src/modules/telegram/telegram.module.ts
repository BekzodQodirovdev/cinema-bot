import { Module } from '@nestjs/common';
import { TelegramController } from './telegram.controller';
import { TelegramService } from './telegram.service';
import { StateService } from './state.service';
import { UsersModule } from '../users/users.module';
import { MoviesModule } from '../movies/movies.module';
import { ChannelsModule } from '../channels/channels.module';
import { AuthModule } from '../auth/auth.module';
import { StateModule } from './state.module';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [
    ConfigModule,
    UsersModule,
    MoviesModule,
    ChannelsModule,
    AuthModule,
    StateModule,
  ],
  controllers: [TelegramController],
  providers: [TelegramService, StateService],
  exports: [TelegramService],
})
export class TelegramModule {}