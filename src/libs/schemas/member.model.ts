import { Schema } from 'mongoose';
import {
  AuthProvider,
  DoctorClinicStatus,
  DoctorSpecialization,
  MemberStatus,
  MemberType,
} from '../enum/member.enum.js';

export const MEMBER_MODEL_NAME = 'Member';

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
    required: true,
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
    ref: MEMBER_MODEL_NAME,
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
