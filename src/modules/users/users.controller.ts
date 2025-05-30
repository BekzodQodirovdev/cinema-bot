import { Controller, Get, Post, Body, Param, Delete, UseGuards } from '@nestjs/common';
import { UsersService } from './users.service';
import { RoleGuard } from '../auth/guards/role.guard';
import { UserRole } from '../../common/enums/user-role.enum';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('count')
  async getUsersCount() {
    const count = await this.usersService.getUsersCount();
    return { count };
  }

  @Get()
  @UseGuards(new RoleGuard([UserRole.ADMIN, UserRole.SUPER_ADMIN]))
  async getAllUsers() {
    const users = await this.usersService.getAllUsers();
    return { users };
  }

  @Post('admin/:telegramId')
  @UseGuards(new RoleGuard([UserRole.SUPER_ADMIN]))
  async addAdmin(@Param('telegramId') telegramId: string) {
    const user = await this.usersService.addAdmin(parseInt(telegramId));
    return { message: 'Admin added successfully', user };
  }

  @Delete('admin/:telegramId')
  @UseGuards(new RoleGuard([UserRole.SUPER_ADMIN]))
  async removeAdmin(@Param('telegramId') telegramId: string) {
    const user = await this.usersService.removeAdmin(parseInt(telegramId));
    return { message: 'Admin removed successfully', user };
  }

  @Get(':telegramId')
  async getUserByTelegramId(@Param('telegramId') telegramId: string) {
    const user = await this.usersService.getUserByTelegramId(parseInt(telegramId));
    return { user };
  }
}