import {
  BadRequestException,
  ConflictException,
  Injectable,
  ForbiddenException,
  NotFoundException,
  Optional,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomBytes, randomInt } from 'node:crypto';
import { Model, Types } from 'mongoose';
import {
  AuthProvider,
  DoctorClinicStatus,
  MemberStatus,
  MemberType,
} from '../../libs/enum/member.enum.js';
import { Location } from '../../libs/enum/location.enum.js';
import { MEMBER } from '../../schemas/member.model.js';
import {
  MEMBER_SESSION,
  type MemberSessionEntity,
} from '../../schemas/member-session.model.js';
import type {
  MemberAuthResponse,
  MemberUpdateResponse,
  MemberSelfProfile,
  MemberDocument,
  MemberEntity,
  MemberPrincipal,
  MemberProfile,
  GoogleIdentity,
} from '../../libs/types/member.types.js';
import type {
  LoginDto,
  SignupDto,
} from '../../libs/dto/member/member-auth.dto.js';
import { hashPassword, verifyPassword } from '../auth/member-password.js';
import { MemberUpdateInput } from '../../libs/dto/member/member-update.input.js';
import { UploadService } from '../upload/upload.service.js';
import { GoogleAuthService } from '../auth/google-auth.service.js';

const REFRESH_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;
const tokenHash = (token: string) =>
  createHash('sha256').update(token).digest('hex');

@Injectable()
export class MemberService {
  constructor(
    private readonly jwt: JwtService,
    private readonly googleAuth: GoogleAuthService,
    @Optional()
    @InjectModel(MEMBER)
    private readonly members?: Model<MemberEntity>,
    @Optional()
    @InjectModel(MEMBER_SESSION)
    private readonly sessions?: Model<MemberSessionEntity>,
    @Optional() private readonly uploads?: UploadService,
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
        memberType: {
          $in: [MemberType.USER, MemberType.DOCTOR, MemberType.CLINIC],
        },
        memberStatus: MemberStatus.ACTIVE,
        deletedAt: null,
      })
      .select(this.publicFields)
      .lean()
      .exec();
    if (!member) throw new NotFoundException('Member not found');
    return (await this.hydrateLocations([member]))[0];
  }

  private readonly publicFields = {
    _id: 1,
    memberType: 1,
    memberStatus: 1,
    memberNick: 1,
    memberFullName: 1,
    memberImage: 1,
    memberAddress: 1,
    memberDesc: 1,
    location: 1,
    clinicId: 1,
    clinicName: 1,
    clinicTimezone: 1,
    doctorClinicStatus: 1,
    doctorSpecializations: 1,
  };

  async myProfile(principal: MemberPrincipal): Promise<MemberSelfProfile> {
    if (!this.members)
      throw new ServiceUnavailableException('Member lookup is unavailable');
    const member = await this.members
      .findOne({
        _id: principal._id,
        memberStatus: MemberStatus.ACTIVE,
        deletedAt: null,
      })
      .select({
        ...this.publicFields,
        memberEmail: 1,
        memberPhone: 1,
        authProvider: 1,
        authVersion: 1,
      })
      .lean()
      .exec();
    if (!member || (member.authVersion ?? 0) !== (principal.authVersion ?? 0))
      throw new UnauthorizedException('Invalid access token');
    return this.selfProfile(member);
  }

  private async selfProfile(member: MemberEntity): Promise<MemberSelfProfile> {
    const profile = Object.fromEntries(
      (Object.keys(this.publicFields) as (keyof MemberProfile)[]).map((key) => [
        key,
        member[key],
      ]),
    ) as MemberProfile;
    const [hydrated] = await this.hydrateLocations([profile]);
    return {
      ...hydrated,
      memberPhone: member.memberPhone ?? undefined,
      memberEmail: member.memberEmail ?? undefined,
      canChangePassword: member.authProvider === AuthProvider.EMAIL,
    };
  }

  async listDoctors(): Promise<MemberProfile[]> {
    if (!this.members)
      throw new ServiceUnavailableException('Member lookup is unavailable');
    const doctors = await this.members
      .find({
        memberType: MemberType.DOCTOR,
        memberStatus: MemberStatus.ACTIVE,
        deletedAt: null,
        doctorClinicStatus: DoctorClinicStatus.APPROVED,
      })
      .select(this.publicFields)
      .sort({ memberFullName: 1, _id: 1 })
      .limit(100)
      .lean()
      .exec();
    return this.hydrateLocations(doctors);
  }

  async listClinicDoctors(principal: MemberPrincipal) {
    if (principal.memberType !== MemberType.CLINIC)
      throw new ForbiddenException('Only clinics can review affiliations');
    if ((await this.myProfile(principal)).memberType !== MemberType.CLINIC)
      throw new ForbiddenException('Only clinics can review affiliations');
    const doctors = await this.members!.find({
      clinicId: principal._id,
      memberType: MemberType.DOCTOR,
      memberStatus: MemberStatus.ACTIVE,
      deletedAt: null,
    })
      .select(this.publicFields)
      .sort({ memberFullName: 1, _id: 1 })
      .limit(100)
      .lean()
      .exec();
    return this.hydrateLocations(doctors);
  }

  async reviewDoctorAffiliation(
    doctorId: string,
    approve: boolean,
    principal: MemberPrincipal,
  ) {
    if (principal.memberType !== MemberType.CLINIC)
      throw new ForbiddenException('Only clinics can review affiliations');
    if (!/^[a-f\d]{24}$/i.test(doctorId))
      throw new BadRequestException('Invalid doctor ID');
    if ((await this.myProfile(principal)).memberType !== MemberType.CLINIC)
      throw new ForbiddenException('Only clinics can review affiliations');
    const scope = {
      _id: new Types.ObjectId(doctorId),
      clinicId: principal._id,
      memberType: MemberType.DOCTOR,
      memberStatus: MemberStatus.ACTIVE,
      deletedAt: null,
    };
    const doctor = await this.members!.findOne(scope)
      .select({ doctorClinicStatus: 1 })
      .lean()
      .exec();
    if (!doctor) throw new NotFoundException('Doctor application not found');
    const status = approve
      ? DoctorClinicStatus.APPROVED
      : DoctorClinicStatus.REJECTED;
    if (doctor.doctorClinicStatus === status) return status;
    if (doctor.doctorClinicStatus !== DoctorClinicStatus.PENDING)
      throw new ConflictException('Only pending affiliations can be reviewed');
    const result = await this.members!.updateOne(
      { ...scope, doctorClinicStatus: DoctorClinicStatus.PENDING },
      { $set: { doctorClinicStatus: status } },
    );
    if (result.modifiedCount !== 1)
      throw new ConflictException(
        'Doctor application changed; refresh before reviewing',
      );
    return status;
  }

  // Clinics own cities. Resolve doctor cities from current affiliations in one query.
  private async hydrateLocations<
    T extends Pick<MemberProfile, 'memberType' | 'clinicId' | 'location'>,
  >(records: T[]): Promise<T[]> {
    const clinicIds = [
      ...new Map(
        records
          .filter(
            (record) =>
              record.memberType === MemberType.DOCTOR && record.clinicId,
          )
          .map((record) => [String(record.clinicId), record.clinicId!]),
      ).values(),
    ];
    const cities = new Map<string, Location | undefined>();
    if (clinicIds.length) {
      if (!this.members)
        throw new ServiceUnavailableException('Member lookup is unavailable');
      const clinics = await this.members
        .find({
          _id: { $in: clinicIds },
          memberType: MemberType.CLINIC,
          memberStatus: MemberStatus.ACTIVE,
          deletedAt: null,
        })
        .select({ _id: 1, location: 1 })
        .lean()
        .exec();
      for (const clinic of clinics)
        cities.set(String(clinic._id), clinic.location ?? undefined);
    }
    return records.map((record) => ({
      ...record,
      location:
        record.memberType === MemberType.DOCTOR
          ? cities.get(String(record.clinicId))
          : record.memberType === MemberType.CLINIC
            ? record.location
            : undefined,
    }));
  }

  async authenticateAccessToken(token: string): Promise<MemberPrincipal> {
    let subject: string;
    let version: number;
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
      const tokenVersion =
        claims.authVersion === undefined ? 0 : claims.authVersion;
      if (
        typeof tokenVersion !== 'number' ||
        !Number.isSafeInteger(tokenVersion) ||
        tokenVersion < 0
      )
        throw new Error('Invalid claims');
      version = tokenVersion;
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
      .select({ _id: 1, memberType: 1, authVersion: 1 })
      .lean()
      .exec();
    if (!member || (member.authVersion ?? 0) !== version)
      throw new UnauthorizedException('Invalid access token');
    return {
      _id: member._id,
      memberType: member.memberType,
      authVersion: member.authVersion ?? 0,
    };
  }

  async updateMember(
    principal: MemberPrincipal,
    input: MemberUpdateInput,
  ): Promise<MemberUpdateResponse> {
    const { members } = this.models();
    const member = await members
      .findOne({
        _id: principal._id,
        memberStatus: MemberStatus.ACTIVE,
        deletedAt: null,
      })
      .select('+memberPassword +authVersion')
      .exec();
    if (!member || (member.authVersion ?? 0) !== (principal.authVersion ?? 0))
      throw new UnauthorizedException('Invalid access token');
    if (
      member.memberType !== MemberType.CLINIC &&
      (input.clinicName !== undefined || input.location !== undefined)
    )
      throw new BadRequestException('Clinic fields require a clinic account');

    const changePassword =
      input.currentPassword !== undefined ||
      input.newPassword !== undefined ||
      input.confirmPassword !== undefined;
    if (changePassword) {
      if (
        !input.currentPassword ||
        !input.newPassword ||
        !input.confirmPassword ||
        input.newPassword !== input.confirmPassword
      )
        throw new BadRequestException(
          'Provide the current password and matching new passwords',
        );
      if (member.authProvider !== AuthProvider.EMAIL)
        throw new ForbiddenException(
          'Password changes require an email account',
        );
      if (!(await verifyPassword(input.currentPassword, member.memberPassword)))
        throw new BadRequestException('Current password is incorrect');
    }
    const update: Record<string, unknown> = {};
    for (const field of [
      'memberFullName',
      'memberNick',
      'memberPhone',
      'memberImage',
      'memberAddress',
      'memberDesc',
      'clinicName',
      'location',
    ] as const) {
      if (input[field] !== undefined) update[field] = input[field];
    }
    if (changePassword)
      update.memberPassword = await hashPassword(input.newPassword!);
    if (!Object.keys(update).length)
      throw new BadRequestException('No fields to update');

    const imageChanged =
      input.memberImage !== undefined &&
      input.memberImage !== member.memberImage;
    const target =
      member.memberType === MemberType.CLINIC ? 'clinic' : 'member';
    let releaseImage: (() => Promise<void>) | undefined;
    if (imageChanged) {
      if (!this.uploads)
        throw new ServiceUnavailableException('Image storage is unavailable');
      if (input.memberImage !== '')
        releaseImage = await this.uploads.claimProfileImage(
          input.memberImage!,
          String(member._id),
          target,
        );
    }
    let saved: MemberDocument | null;
    try {
      // Compare-and-swap prevents concurrent saves/password checks from overwriting newer state.
      const version = member.get('__v') as number | undefined;
      saved = await members
        .findOneAndUpdate(
          {
            _id: member._id,
            memberStatus: MemberStatus.ACTIVE,
            deletedAt: null,
            memberType: member.memberType,
            ...(version === undefined
              ? { __v: { $exists: false } }
              : { __v: version }),
          },
          {
            $set: update,
            $inc: { __v: 1, ...(changePassword ? { authVersion: 1 } : {}) },
          },
          { new: true, runValidators: true, context: 'query' },
        )
        .select('+authVersion')
        .exec();
    } catch (error) {
      const duplicate =
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        error.code === 11000;
      const invalid =
        error instanceof Error && error.name === 'ValidationError';
      // Unknown write outcomes retain the claim; cleanup can reconcile them later.
      if (duplicate || invalid) await releaseImage?.().catch(() => {});
      if (duplicate)
        throw new ConflictException(
          'Phone number or nickname is already in use',
        );
      if (invalid) throw new BadRequestException('Invalid member update');
      throw new ServiceUnavailableException('Member update is unavailable');
    }
    if (!saved) {
      await releaseImage?.().catch(() => {});
      throw new ConflictException('Member changed; reload before saving again');
    }
    let imageCleanupPending = false;
    if (imageChanged && member.memberImage) {
      try {
        await this.uploads!.deletePreviousProfileImage(
          member.memberImage,
          String(member._id),
          target,
        );
      } catch {
        imageCleanupPending = true;
      }
    }
    return {
      member: await this.selfProfile(saved),
      requiresLogin: changePassword,
      imageCleanupPending,
    };
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
    if (input.location !== undefined && memberType !== MemberType.CLINIC)
      throw new BadRequestException(
        'Only clinics can choose a location; doctors inherit their clinic city',
      );
    if (
      memberType === MemberType.CLINIC &&
      !Object.values(Location).includes(input.location as Location)
    )
      throw new BadRequestException('A supported clinic location is required');
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
              location: input.location,
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
      .select('+memberPassword +authVersion')
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

  async loginWithGoogle(
    idToken: string,
    nonce?: string,
  ): Promise<MemberAuthResponse> {
    const identity = await this.googleAuth.verify(idToken, nonce);
    const { members } = this.models();
    // Await sparse unique indexes before creating accounts or resolving races.
    await members.init();
    let member = await members
      .findOne({ googleId: identity.sub })
      .select('+authVersion')
      .exec();
    if (!member) member = await this.createGoogleMember(identity, members);
    if (member.memberStatus !== MemberStatus.ACTIVE || member.deletedAt)
      throw new UnauthorizedException('Invalid Google sign-in');
    return this.issueTokens(member);
  }

  private async createGoogleMember(
    identity: GoogleIdentity,
    members: Model<MemberEntity>,
  ): Promise<MemberDocument> {
    // Strip non-printing characters from the provider's display name.
    // oxlint-disable-next-line no-control-regex
    const name = identity.name?.replace(/[\u0000-\u001f\u007f]/g, '').trim();
    const displayName = name ? name.slice(0, 40) : undefined;
    for (let attempt = 0; attempt < 10; attempt++) {
      // Names can collide; the database index is authoritative, including races.
      const memberNick =
        attempt === 0 && displayName
          ? displayName
          : `google_user${randomInt(1_000_000).toString().padStart(6, '0')}`;
      try {
        return await members.create({
          googleId: identity.sub,
          authProvider: AuthProvider.GOOGLE,
          memberType: MemberType.USER,
          memberStatus: MemberStatus.ACTIVE,
          memberNick,
          ...(identity.email ? { memberEmail: identity.email } : {}),
          ...(name ? { memberFullName: name.slice(0, 100) } : {}),
          ...(identity.picture ? { memberImage: identity.picture } : {}),
          // Omit phone/password entirely: sparse unique indexes must not see nulls.
        });
      } catch (error) {
        if (
          typeof error !== 'object' ||
          error === null ||
          !('code' in error) ||
          error.code !== 11000
        )
          throw error;
        const existing = await members
          .findOne({ googleId: identity.sub })
          .select('+authVersion')
          .exec();
        if (existing) return existing;
        // Never automatically link or overwrite another account based on email.
        if (
          identity.email &&
          (await members.exists({ memberEmail: identity.email }))
        )
          throw new ConflictException(
            'An account with these details already exists',
          );
      }
    }
    throw new ConflictException(
      'Unable to assign a unique nickname; try again',
    );
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
    const member = await members
      .findById(session.memberId)
      .select('+authVersion')
      .exec();
    if (
      !member ||
      member.memberStatus !== MemberStatus.ACTIVE ||
      member.deletedAt ||
      (member.authVersion ?? 0) !== (session.authVersion ?? 0)
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
      authVersion: member.authVersion ?? 0,
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
      member: (
        await this.hydrateLocations([
          {
            _id: member._id,
            memberEmail: member.memberEmail,
            memberNick: member.memberNick,
            memberType: member.memberType,
            memberStatus: member.memberStatus,
            memberFullName: member.memberFullName,
            memberImage: member.memberImage,
            location: member.location,
            clinicId: member.clinicId,
            clinicName: member.clinicName,
            clinicTimezone: member.clinicTimezone,
            doctorClinicStatus: member.doctorClinicStatus,
          },
        ])
      )[0],
      accessToken: await this.jwt.signAsync({
        sub: member._id.toString(),
        tokenType: 'access',
        authVersion: member.authVersion ?? 0,
      }),
      refreshToken,
    };
  }
}
