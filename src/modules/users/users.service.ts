import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User, UserDocument } from './schemas/user.schema';
import { UserRole } from '../../common/enums/user-role.enum';

@Injectable()
export class UsersService {
  constructor(@InjectModel(User.name) private userModel: Model<UserDocument>) {}

  async findOrCreateUser(telegramUser: any): Promise<UserDocument> {
    let user = await this.userModel.findOne({
      telegramId: telegramUser.id,
    });

    if (!user) {
      user = new this.userModel({
        telegramId: telegramUser.id,
        firstName: telegramUser.first_name,
        lastName: telegramUser.last_name,
        username: telegramUser.username,
        role:
          this.getSuperAdminId() === telegramUser.id
            ? UserRole.SUPER_ADMIN
            : UserRole.USER,
      });
      await user.save();
    }

    // Update last activity
    user.lastActivity = new Date();
    await user.save();

    return user;
  }

  async getUserByTelegramId(telegramId: number): Promise<UserDocument | null> {
    return this.userModel.findOne({ telegramId });
  }

  async getAllUsers(): Promise<UserDocument[]> {
    return this.userModel.find({ isActive: true });
  }

  async getUsersCount(): Promise<number> {
    return this.userModel.countDocuments({ isActive: true });
  }

  async addAdmin(telegramId: number): Promise<UserDocument | null> {
    return this.userModel.findOneAndUpdate(
      { telegramId },
      { role: UserRole.ADMIN },
      { new: true },
    );
  }

  async removeAdmin(telegramId: number): Promise<UserDocument | null> {
    return this.userModel.findOneAndUpdate(
      { telegramId },
      { role: UserRole.USER },
      { new: true },
    );
  }

  async updateSubscribedChannels(
    telegramId: number,
    channels: string[],
  ): Promise<UserDocument | null> {
    return this.userModel.findOneAndUpdate(
      { telegramId },
      { subscribedChannels: channels },
      { new: true },
    );
  }

  private getSuperAdminId(): number {
    if (!process.env.SUPER_ADMIN_ID) {
      throw new Error('SUPER_ADMIN_ID is not defined');
    }
    return parseInt(process.env.SUPER_ADMIN_ID);
  }

  async isAdmin(telegramId: number): Promise<boolean> {
    const user = await this.getUserByTelegramId(telegramId);
    return !!user && (user.role === UserRole.ADMIN || user.role === UserRole.SUPER_ADMIN);
  }

  async isSuperAdmin(telegramId: number): Promise<boolean> {
    const user = await this.getUserByTelegramId(telegramId);
    return !!user && user.role === UserRole.SUPER_ADMIN;
  }

  async getAllAdmins(): Promise<UserDocument[]> {
    return this.userModel.find({
      role: { $in: [UserRole.ADMIN, UserRole.SUPER_ADMIN] },
      isActive: true
    });
  }
}
