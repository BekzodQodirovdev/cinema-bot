import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { UserRole } from '../../../common/enums/user-role.enum';

@Injectable()
export class RoleGuard implements CanActivate {
  constructor(private readonly requiredRoles: UserRole[]) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      return false;
    }

    return this.requiredRoles.includes(user.role);
  }
}