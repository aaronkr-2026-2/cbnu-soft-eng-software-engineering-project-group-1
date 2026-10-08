import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
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
import { MEMBER } from '../../schemas/member.model.js';
import {
  MEMBER_SESSION,
  type MemberSessionEntity,
} from '../../schemas/member-session.model.js';
import type {
  MemberAuthResponse,
  MemberDocument,
  MemberEntity,
  MemberPrincipal,
  MemberProfile,
} from '../../libs/types/member.types.js';
import type { LoginDto, SignupDto } from '../../libs/dto/member/member-auth.dto.js';
import { hashPassword, verifyPassword } from '../auth/member-password.js';

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

  async getMember(id: string): Promise<MemberProfile> {
    if (!/^[a-f\d]{24}$/i.test(id))
      throw new BadRequestException('Invalid member ID');
    if (!this.members)
      throw new ServiceUnavailableException('Member lookup is unavailable');

    const member = await this.members
      .findOne({
        _id: new Types.ObjectId(id),
        memberType: { $in: [MemberType.USER, MemberType.DOCTOR, MemberType.CLINIC] },
        memberStatus: MemberStatus.ACTIVE,
        deletedAt: null,
      })
      .select({
        _id: 1,
        memberType: 1,
        memberStatus: 1,
        memberNick: 1,
        memberFullName: 1,
        memberImage: 1,
        memberAddress: 1,
        memberDesc: 1,
        clinicId: 1,
        clinicName: 1,
        clinicTimezone: 1,
        doctorClinicStatus: 1,
        doctorSpecializations: 1,
      })
      .lean()
      .exec();
    if (!member) throw new NotFoundException('Member not found');
    return member;
  }

  async authenticateAccessToken(token: string): Promise<MemberPrincipal> {
    let subject: string;
    try {
      const claims = await this.jwt.verifyAsync<Record<string, unknown>>(
        token,
        {
          algorithms: ['HS256'],
          issuer: 'medconnect',
          audience: 'medconnect-api',
        },
      );
      if (
        claims.tokenType !== 'access' ||
        typeof claims.sub !== 'string' ||
        !/^[a-f\d]{24}$/i.test(claims.sub) ||
        typeof claims.exp !== 'number' ||
        claims.exp <= Date.now() / 1000
      )
        throw new Error('Invalid claims');
      subject = claims.sub;
    } catch {
      throw new UnauthorizedException('Invalid access token');
    }
    if (!this.members)
      throw new ServiceUnavailableException('Authentication is unavailable');
    const member = await this.members
      .findOne({
        _id: new Types.ObjectId(subject),
        memberStatus: MemberStatus.ACTIVE,
        deletedAt: null,
      })
      .select({ _id: 1, memberType: 1 })
      .lean()
      .exec();
    if (!member) throw new UnauthorizedException('Invalid access token');
    return { _id: member._id, memberType: member.memberType };
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
