import { registerEnumType } from "@nestjs/graphql";

export enum MemberType {
  USER = "USER",
  DOCTOR = "DOCTOR",
  CLINIC = "CLINIC",
  ADMIN = "ADMIN"
}
registerEnumType(MemberType, {
  name: 'MemberType'
});

export enum MemberStatus {
  ACTIVE = "ACTIVE",
  SUSPENDED = "SUSPENDED",
  DELETED = "DELETED",
}
registerEnumType(MemberStatus, {
  name: 'MemberStatus'
});

// This is intentionally separate from MemberStatus. A doctor can have an
// active account while waiting for a clinic to approve their affiliation.
export enum DoctorClinicStatus {
  NOT_APPLICABLE = "NOT_APPLICABLE",
  PENDING = "PENDING",
  APPROVED = "APPROVED",
  REJECTED = "REJECTED",
  REMOVED = "REMOVED",
}
registerEnumType(DoctorClinicStatus, {
  name: 'DoctorClinicStatus',
});

export enum DoctorSpecialization {
  CARDIOLOGIST = "CARDIOLOGIST",               // HEART
  DENTIST = "DENTIST",                         // TEETH
  PEDIATRICIAN = "PEDIATRICIAN",               // CHILDREN
  DERMATOLOGIST = "DERMATOLOGIST",             // SKIN
  PSYCHIATRIST = "PSYCHIATRIST",               // MIND
  NEUROLOGIST = "NEUROLOGIST",                 // BRAIN
  OPHTHALMOLOGIST = "OPHTHALMOLOGIST",         // EYES
  ORTHOPEDIC = "ORTHOPEDIC",                   // BONE
  ONCOLOGIST = "ONCOLOGIST",                   // CANCER
  GYNAECOLOGIST = "GYNAECOLOGIST",             // WOMEN
  GASTROENTEROLOGIST = "GASTROENTEROLOGIST",   // STOMACH
  OTOLARYNGOLOGIST = "OTOLARYNGOLOGIST",       // EARS
  SURGEON = "SURGEON"                          // SURGERY
}
registerEnumType(DoctorSpecialization, {
  name: 'DoctorSpecialization'
});

export enum AuthProvider {
  EMAIL = "EMAIL",
  TELEGRAM = "TELEGRAM",
  GOOGLE = "GOOGLE",
}
registerEnumType(AuthProvider, {
  name: 'AuthProvider'
});
