import {
  Injectable,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import type { Request } from 'express';
import { MemberService } from '../../member/member.service.js';
import type { MemberPrincipal } from '../../../libs/types/member.types.js';

export type AuthenticatedRequest = Request & { member: MemberPrincipal };

@Injectable()
export class MemberAccessGuard implements CanActivate {
  constructor(private readonly memberService: MemberService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const match = /^Bearer ([^\s]+)$/i.exec(
      request.headers.authorization ?? '',
    );
    if (!match) throw new UnauthorizedException('Invalid access token');
    request.member = await this.memberService.authenticateAccessToken(match[1]);
    return true;
  }
}
