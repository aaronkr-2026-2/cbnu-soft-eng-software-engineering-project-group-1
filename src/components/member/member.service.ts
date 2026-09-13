import {
  BadRequestException,
  ConflictException,
  Injectable,
  Optional,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomBytes } from 'node:crypto';
import { Model, Types } from 'mongoose';
import {
  AuthProvider,
  DoctorClinicStatus,
  MemberStatus,
  MemberType,
} from '../../libs/enum/member.enum.js';
import { MEMBER } from '../../libs/schemas/member.model.js';
import {
  MEMBER_SESSION,
  type MemberSessionEntity,
} from '../../libs/schemas/member-session.model.js';
import type {
  MemberAuthResponse,
  MemberDocument,
  MemberEntity,
} from '../../libs/types/member.types.js';
import type { LoginDto, SignupDto } from './dto/member-auth.dto.js';
import { hashPassword, verifyPassword } from './member-password.js';

const REFRESH_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;
const tokenHash = (token: string) =>
  createHash('sha256').update(token).digest('hex');

@Injectable()
export class MemberService {
  constructor(
    private readonly jwt: JwtService,
    @Optional()
    @InjectModel(MEMBER)
    private readonly members?: Model<MemberEntity>,
    @Optional()
    @InjectModel(MEMBER_SESSION)
    private readonly sessions?: Model<MemberSessionEntity>,
  ) {}

  private models() {
    if (!this.members || !this.sessions)
      throw new ServiceUnavailableException('Authentication is unavailable');
    return { members: this.members, sessions: this.sessions };
  }

  async signup(input: SignupDto): Promise<MemberAuthResponse> {
    const { members } = this.models();
    const memberType = input.memberType ?? MemberType.USER;
    if (
      ![MemberType.USER, MemberType.CLINIC, MemberType.DOCTOR].includes(
        memberType,
      )
    ) {
      throw new BadRequestException('Invalid member type');
    }
    if (
      memberType !== MemberType.CLINIC &&
      (input.clinicName !== undefined || input.clinicTimezone !== undefined)
    ) {
      throw new BadRequestException('Clinic fields require a clinic account');
    }
    if (
      memberType !== MemberType.DOCTOR &&
      (input.clinicId !== undefined ||
        input.doctorSpecializations !== undefined ||
        input.professionalLicenseNumber !== undefined)
    ) {
      throw new BadRequestException('Doctor fields require a doctor account');
    }
    if (memberType === MemberType.DOCTOR) {
      const clinic = await members.exists({
        _id: input.clinicId,
        memberType: MemberType.CLINIC,
        memberStatus: MemberStatus.ACTIVE,
        deletedAt: null,
      });
      if (!clinic)
        throw new BadRequestException('An active clinic is required');
    }
    let member: MemberDocument;
    try {
      member = await members.create({
        memberEmail: input.memberEmail.trim().toLowerCase(),
        memberPassword: await hashPassword(input.memberPassword),
        memberPhone: input.memberPhone,
        memberNick: input.memberNick,
        memberFullName: input.memberFullName,
        memberType,
        memberStatus: MemberStatus.ACTIVE,
        authProvider: AuthProvider.EMAIL,
        ...(memberType === MemberType.CLINIC
          ? {
              clinicName: input.clinicName,
              clinicTimezone: input.clinicTimezone ?? 'Asia/Seoul',
            }
          : {}),
        ...(memberType === MemberType.DOCTOR
          ? {
              clinicId: new Types.ObjectId(input.clinicId),
              doctorSpecializations: input.doctorSpecializations,
              professionalLicenseNumber: input.professionalLicenseNumber,
              doctorClinicStatus: DoctorClinicStatus.PENDING,
            }
          : {}),
      });
    } catch (error) {
      if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        error.code === 11000
      ) {
        throw new ConflictException(
          'An account with these details already exists',
        );
      }
      throw error;
    }
    return this.issueTokens(member);
  }

  async login(input: LoginDto): Promise<MemberAuthResponse> {
    const { members } = this.models();
    const member = await members
      .findOne({ memberEmail: input.memberEmail.trim().toLowerCase() })
      .select('+memberPassword')
      .exec();
    const matches = await verifyPassword(
      input.memberPassword,
      member?.memberPassword,
    );
    if (
      !member ||
      !matches ||
      member.authProvider !== AuthProvider.EMAIL ||
      member.memberStatus !== MemberStatus.ACTIVE ||
      member.deletedAt
    ) {
      throw new UnauthorizedException('Invalid email or password');
    }
    return this.issueTokens(member);
  }

  async refresh(refreshToken: string): Promise<MemberAuthResponse> {
    const { members, sessions } = this.models();
    const nextToken = randomBytes(32).toString('base64url');
    // Atomic replacement ensures only one request can consume the old token.
    const session = await sessions
      .findOneAndUpdate(
        {
          refreshTokenHash: tokenHash(refreshToken),
          expiresAt: { $gt: new Date() },
        },
        { $set: { refreshTokenHash: tokenHash(nextToken) } },
        { new: true },
      )
      .exec();
    if (!session) throw new UnauthorizedException('Invalid refresh token');
    const member = await members.findById(session.memberId).exec();
    if (
      !member ||
      member.memberStatus !== MemberStatus.ACTIVE ||
      member.deletedAt
    ) {
      await sessions.deleteOne({ _id: session._id });
      throw new UnauthorizedException('Invalid refresh token');
    }
    return this.response(member, nextToken);
  }

  private async issueTokens(
    member: MemberDocument,
  ): Promise<MemberAuthResponse> {
    const { sessions } = this.models();
    const refreshToken = randomBytes(32).toString('base64url');
    const response = await this.response(member, refreshToken);
    await sessions.create({
      memberId: member._id,
      refreshTokenHash: tokenHash(refreshToken),
      expiresAt: new Date(Date.now() + REFRESH_LIFETIME_MS),
    });
    return response;
  }

  private async response(
    member: MemberDocument,
    refreshToken: string,
  ): Promise<MemberAuthResponse> {
    return {
      member: {
        _id: member._id,
        memberEmail: member.memberEmail,
        memberNick: member.memberNick,
        memberType: member.memberType,
        memberStatus: member.memberStatus,
        memberFullName: member.memberFullName,
        memberImage: member.memberImage,
        clinicId: member.clinicId,
        clinicName: member.clinicName,
        clinicTimezone: member.clinicTimezone,
        doctorClinicStatus: member.doctorClinicStatus,
      },
      accessToken: await this.jwt.signAsync({
        sub: member._id.toString(),
        tokenType: 'access',
      }),
      refreshToken,
    };
  }
}
