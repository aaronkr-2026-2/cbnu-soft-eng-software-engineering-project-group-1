import { Schema } from 'mongoose';
import {
  AuthProvider,
  DoctorClinicStatus,
  DoctorSpecialization,
  MemberStatus,
  MemberType,
} from '../libs/enum/member.enum.js';
import { Location } from '../libs/enum/location.enum.js';

export const MEMBER = 'Member';

const MemberSchema = new Schema({
  memberType: {
    type: String,
    enum: Object.values(MemberType),
    default: MemberType.USER,
  },

  memberStatus: {
    type: String,
    enum: Object.values(MemberStatus),
    default: MemberStatus.ACTIVE,
  },

  // Increment on password changes to invalidate access and refresh credentials.
  authVersion: { type: Number, default: 0, min: 0, select: false },

  authProvider: {
    type: String,
    enum: Object.values(AuthProvider),
    default: AuthProvider.EMAIL,
  },

  // === Provider IDs (sparse + unique) ===
  telegramId: {
    type: String,
    unique: true,
    sparse: true,
  },
  googleId: {
    type: String,
    unique: true,
    sparse: true,
  },

  // Common identifiers
  memberEmail: {
    type: String,
    trim: true,
    lowercase: true,
    unique: true,
    sparse: true,
    required: function (this: { authProvider?: AuthProvider }) {
      return this.authProvider === AuthProvider.EMAIL;
    },
  },

  memberPhone: {
    type: String,
    trim: true,
    unique: true,
    sparse: true,
    required: function (this: { authProvider?: AuthProvider }) {
      return this.authProvider !== AuthProvider.GOOGLE;
    },
  },

  memberNick: {
    type: String,
    unique: true,
    sparse: true,
    required: true,
  },

  memberPassword: {
    type: String,
    select: false,
    required: function (this: { authProvider?: AuthProvider }) {
      return this.authProvider === AuthProvider.EMAIL;
    },
  },

  memberFullName: {
    type: String,
  },

  memberImage: {
    type: String,
    default: '',
  },

  memberAddress: {
    type: String,
  },

  location: {
    type: String,
    enum: Object.values(Location),
    required: function (this: { memberType?: MemberType }) {
      return this.memberType === MemberType.CLINIC;
    },
    validate: {
      validator: function (
        this: { memberType?: MemberType; getFilter?: () => { memberType?: MemberType } },
        value: string | null | undefined,
      ) {
        return value === undefined || (
          (this.memberType ?? this.getFilter?.().memberType) === MemberType.CLINIC &&
          Object.values(Location).includes(value as Location)
        );
      },
      message: 'Location must be a supported city stored on a clinic',
    },
  },

  memberDesc: {
    type: String,
  },

  // Clinic data is used only when memberType is CLINIC.
  clinicName: {
    type: String,
    trim: true,
    required: function (this: { memberType?: MemberType }) {
      return this.memberType === MemberType.CLINIC;
    },
  },
  clinicTimezone: {
    type: String,
    trim: true,
    default: 'Asia/Seoul',
    required: function (this: { memberType?: MemberType }) {
      return this.memberType === MemberType.CLINIC;
    },
  },

  // Doctors cannot exist independently: every doctor applies to one clinic.
  clinicId: {
    type: Schema.Types.ObjectId,
    ref: MEMBER,
    required: function (this: { memberType?: MemberType }) {
      return this.memberType === MemberType.DOCTOR;
    },
  },

  doctorClinicStatus: {
    type: String,
    enum: Object.values(DoctorClinicStatus),
    default: function (this: { memberType?: MemberType }) {
      return this.memberType === MemberType.DOCTOR
        ? DoctorClinicStatus.PENDING
        : DoctorClinicStatus.NOT_APPLICABLE;
    },
  },

  doctorSpecializations: {
    type: [String],
    enum: Object.values(DoctorSpecialization),
    required: function (this: { memberType?: MemberType }) {
      return this.memberType === MemberType.DOCTOR;
    },
  },

  professionalLicenseNumber: {
    type: String,
    trim: true,
    unique: true,
    sparse: true,
    required: function (this: { memberType?: MemberType }) {
      return this.memberType === MemberType.DOCTOR;
    },
  },

  deletedAt: {
    type: Date,
  },
},
  { timestamps: true, collection: 'members' },
);

// Used to list a clinic's approved doctors without scanning all members.
MemberSchema.index({ clinicId: 1, doctorClinicStatus: 1 });

export default MemberSchema;
