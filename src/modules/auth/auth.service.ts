import { Injectable } from '@nestjs/common';
import { UserRole } from '../../common/enums/user-role.enum';

@Injectable()
export class AuthService {
  validateRole(userRole: UserRole, requiredRoles: UserRole[]): boolean {
    return requiredRoles.includes(userRole);
  }

  isSuperAdmin(userRole: UserRole): boolean {
    return userRole === UserRole.SUPER_ADMIN;
  }

  isAdmin(userRole: UserRole): boolean {
    return userRole === UserRole.ADMIN || userRole === UserRole.SUPER_ADMIN;
  }
}