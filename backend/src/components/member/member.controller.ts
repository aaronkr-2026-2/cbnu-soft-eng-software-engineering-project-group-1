import {
  Body,
  Controller,
  Header,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  GoogleLoginDto,
  LoginDto,
  RefreshDto,
  SignupDto,
} from '../../libs/dto/member/member-auth.dto.js';
import { GoogleAuthService } from '../auth/google-auth.service.js';
import { MemberService } from './member.service.js';
import type { MemberAuthResponse } from '../../libs/types/member.types.js';

@Controller('member')
@ApiTags('Member')
export class MemberController {
  constructor(
    private readonly memberService: MemberService,
    private readonly googleAuth: GoogleAuthService,
  ) {}

  private get nonceCookie() {
    const secure = process.env.NODE_ENV === 'production';
    return {
      name: secure
        ? '__Host-medconnect_google_nonce'
        : 'medconnect_google_nonce',
      options: {
        httpOnly: true,
        secure,
        sameSite: secure ? ('none' as const) : ('lax' as const),
        path: '/',
      },
    };
  }

  @Post('google/nonce')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Start Google sign-in; return a five-minute nonce and set its browser-binding cookie',
  })
  @Header('Cache-Control', 'no-store')
  async googleNonce(@Res({ passthrough: true }) response: Response) {
    const nonce = await this.googleAuth.createNonce();
    const cookie = this.nonceCookie;
    response.cookie(cookie.name, nonce, { ...cookie.options, maxAge: 300_000 });
    return { nonce };
  }

  @Post('google/login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Sign in or register a USER with a Google ID token and its nonce cookie',
  })
  @Header('Cache-Control', 'no-store')
  async googleLogin(
    @Body() input: GoogleLoginDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<MemberAuthResponse> {
    const cookie = this.nonceCookie;
    const values = (request.headers.cookie ?? '')
      .split(';')
      .map((part) => part.trim())
      .filter((part) => part.startsWith(`${cookie.name}=`));
    const nonce =
      values.length === 1 ? values[0].slice(cookie.name.length + 1) : undefined;
    const result = await this.memberService.loginWithGoogle(
      input.idToken,
      nonce,
    );
    response.clearCookie(cookie.name, cookie.options);
    return result;
  }

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
  @ApiOperation({
    summary: 'Rotate a refresh token and issue a new access token',
  })
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'no-store')
  refresh(@Body() input: RefreshDto): Promise<MemberAuthResponse> {
    return this.memberService.refresh(input.refreshToken);
  }
}
