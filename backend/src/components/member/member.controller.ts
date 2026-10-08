import {
  Body,
  Controller,
  Header,
  HttpCode,
  HttpStatus,
  Post,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { LoginDto, RefreshDto, SignupDto } from '../../libs/dto/member/member-auth.dto.js';
import { MemberService } from './member.service.js';
import type { MemberAuthResponse } from '../../libs/types/member.types.js';

@Controller('member')
@ApiTags('Member')
export class MemberController {
  constructor(private readonly memberService: MemberService) {}

  @Post('signup')
  @ApiOperation({ summary: 'Create a member account' })
  @Header('Cache-Control', 'no-store')
  signup(@Body() input: SignupDto): Promise<MemberAuthResponse> {
    return this.memberService.signup(input);
  }

  @Post('login')
  @ApiOperation({ summary: 'Log in and receive access and refresh tokens' })
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'no-store')
  login(@Body() input: LoginDto): Promise<MemberAuthResponse> {
    return this.memberService.login(input);
  }

  @Post('refresh')
  @ApiOperation({ summary: 'Rotate a refresh token and issue a new access token' })
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'no-store')
  refresh(@Body() input: RefreshDto): Promise<MemberAuthResponse> {
    return this.memberService.refresh(input.refreshToken);
  }
}
