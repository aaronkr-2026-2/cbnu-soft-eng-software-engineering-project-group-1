import { randomUUID } from 'node:crypto';
import { Types } from 'mongoose';
import {
  AppointmentSource,
  AppointmentStatus,
} from '../../libs/enum/appointment.enum.js';
import {
  DoctorClinicStatus,
  DoctorSpecialization,
  MemberStatus,
  MemberType,
} from '../../libs/enum/member.enum.js';
import type { BookingCommitment } from '../../libs/types/booking.types.js';
import type { MemberEntity } from '../../libs/types/member.types.js';
import { appointmentSlot } from '../appointment/appointment-slot.js';

export type BookingResolution = {
  appointmentId: string;
  specialty?: DoctorSpecialization;
  status?: AppointmentStatus;
  evidenceRef: string;
};
export type LegacyAppointment = { _id: Types.ObjectId; [key: string]: unknown };
export type MigrationIssue = { appointmentId?: string; code: string };
export type MigrationUpdate = {
  _id: Types.ObjectId;
  source: AppointmentSource;
  version: string;
  status: AppointmentStatus;
  specialty?: DoctorSpecialization;
};
const uuid = /^[a-f\d]{8}-(?:[a-f\d]{4}-){3}[a-f\d]{12}$/i;
const objectId = (value: unknown): value is Types.ObjectId =>
  value instanceof Types.ObjectId;
const validDate = (value: unknown): value is Date =>
  value instanceof Date && Number.isFinite(value.getTime());

export function parseBookingResolutions(value: unknown): BookingResolution[] {
  if (!Array.isArray(value))
    throw new Error('Resolutions must be a JSON array');
  const seen = new Set<string>();
  return value.map((item) => {
    if (
      !item ||
      typeof item !== 'object' ||
      Object.keys(item).some(
        (key) =>
          !['appointmentId', 'specialty', 'status', 'evidenceRef'].includes(
            key,
          ),
      ) ||
      typeof item.appointmentId !== 'string' ||
      !/^[a-f\d]{24}$/i.test(item.appointmentId) ||
      typeof item.evidenceRef !== 'string' ||
      !item.evidenceRef.trim() ||
      item.evidenceRef.length > 200 ||
      (item.specialty !== undefined &&
        !Object.values(DoctorSpecialization).includes(item.specialty)) ||
      (item.status !== undefined &&
        !Object.values(AppointmentStatus).includes(item.status))
    ) {
      throw new Error(
        'Invalid booking resolution; provide appointmentId, evidenceRef and supported specialty/status',
      );
    }
    const appointmentId = item.appointmentId.toLowerCase();
    if (seen.has(appointmentId))
      throw new Error('Duplicate appointment resolution');
    seen.add(appointmentId);
    return {
      appointmentId,
      evidenceRef: item.evidenceRef.trim(),
      ...(item.specialty !== undefined ? { specialty: item.specialty } : {}),
      ...(item.status !== undefined ? { status: item.status } : {}),
    };
  });
}

// No inference from today's doctor specialization list. Existing recorded values
// or an explicit, evidence-backed operator resolution are the only sources.
export function planBookingMigration(
  rows: LegacyAppointment[],
  members: MemberEntity[],
  resolutions: BookingResolution[],
  now = new Date(),
) {
  const issues: MigrationIssue[] = [];
  const updates: MigrationUpdate[] = [];
  const auditChanges: Array<{
    appointmentId: Types.ObjectId;
    previousStatus: string | null;
    previousSpecialty: string | null;
    status: AppointmentStatus;
    specialty: DoctorSpecialization | null;
    version: string;
    evidenceRef: string;
  }> = [];
  const commitments: BookingCommitment[] = [];
  const memberMap = new Map(
    members.map((member) => [String(member._id), member]),
  );
  const decisions = new Map(
    resolutions.map((item) => [item.appointmentId, item]),
  );
  const rowIds = new Set(rows.map((row) => String(row._id)));
  for (const decision of resolutions) {
    if (!rowIds.has(decision.appointmentId))
      issues.push({
        appointmentId: decision.appointmentId,
        code: 'UNKNOWN_RESOLUTION',
      });
  }
  for (const row of rows) {
    const appointmentId = String(row._id);
    const issue = (code: string) => issues.push({ appointmentId, code });
    const decision = decisions.get(appointmentId);
    const source = row.source ?? AppointmentSource.LEGACY;
    const status = decision?.status ?? row.status;
    const specialty = decision?.specialty ?? row.specialty;
    if (
      !Object.values(AppointmentSource).includes(source as AppointmentSource) ||
      !Object.values(AppointmentStatus).includes(status as AppointmentStatus)
    ) {
      issue('INVALID_METADATA');
      continue;
    }
    if (decision?.status !== undefined && decision.status !== row.status) {
      if (
        ![AppointmentStatus.PENDING, AppointmentStatus.CONFIRMED].includes(
          row.status as AppointmentStatus,
        ) ||
        decision.status === AppointmentStatus.PENDING
      )
        issue('INVALID_STATUS_RESOLUTION');
      if (
        decision.status === AppointmentStatus.CONFIRMED &&
        (!validDate(row.startsAt) || row.startsAt <= now)
      )
        issue('PAST_CONFIRMATION');
      if (
        [AppointmentStatus.COMPLETED, AppointmentStatus.NO_SHOW].includes(
          decision.status,
        ) &&
        (!validDate(row.endsAt) || row.endsAt > now)
      )
        issue('PREMATURE_TERMINAL_STATUS');
    }
    if (
      source !== AppointmentSource.LEGACY &&
      decision?.specialty !== undefined &&
      decision.specialty !== row.specialty
    )
      issue('RECORDED_SPECIALTY_IMMUTABLE');
    if (
      specialty != null &&
      !Object.values(DoctorSpecialization).includes(
        specialty as DoctorSpecialization,
      )
    ) {
      issue('INVALID_SPECIALTY');
      continue;
    }
    if (
      row.version != null &&
      (typeof row.version !== 'string' || !uuid.test(row.version))
    ) {
      issue('INVALID_VERSION');
      continue;
    }
    const update: MigrationUpdate = {
      _id: row._id,
      source: source as AppointmentSource,
      status: status as AppointmentStatus,
      version: (row.version as string | undefined) ?? randomUUID(),
      ...(specialty != null
        ? { specialty: specialty as DoctorSpecialization }
        : {}),
    };
    updates.push(update);
    if (
      row.source !== update.source ||
      row.version !== update.version ||
      row.status !== update.status ||
      (row.specialty ?? null) !== (update.specialty ?? null)
    ) {
      auditChanges.push({
        appointmentId: row._id,
        previousStatus: typeof row.status === 'string' ? row.status : null,
        previousSpecialty:
          typeof row.specialty === 'string' ? row.specialty : null,
        status: update.status,
        specialty: update.specialty ?? null,
        version: update.version,
        evidenceRef: decision?.evidenceRef ?? 'EXISTING_RECORDED_VALUES',
      });
    }
    const active =
      status === AppointmentStatus.PENDING ||
      status === AppointmentStatus.CONFIRMED;
    if (status === AppointmentStatus.PENDING)
      issue('PENDING_REQUIRES_RESOLUTION');
    if (
      !objectId(row._id) ||
      !objectId(row.patientId) ||
      !objectId(row.doctorId) ||
      !objectId(row.clinicId) ||
      !validDate(row.startsAt) ||
      !validDate(row.endsAt) ||
      row.endsAt.getTime() - row.startsAt.getTime() !== 30 * 60_000
    ) {
      issue('INVALID_PARTICIPANTS_OR_TIME');
      continue;
    }
    if (!active) continue;
    if (row.endsAt <= now) issue('STALE_ACTIVE_APPOINTMENT');
    if (!specialty) {
      issue('SPECIALTY_REQUIRES_RESOLUTION');
      continue;
    }
    const patient = memberMap.get(String(row.patientId));
    const clinic = memberMap.get(String(row.clinicId));
    const doctor = memberMap.get(String(row.doctorId));
    if (
      !patient ||
      patient.memberType !== MemberType.USER ||
      patient.memberStatus !== MemberStatus.ACTIVE ||
      patient.deletedAt ||
      !clinic ||
      clinic.memberType !== MemberType.CLINIC ||
      clinic.memberStatus !== MemberStatus.ACTIVE ||
      clinic.deletedAt ||
      !doctor ||
      doctor.memberType !== MemberType.DOCTOR ||
      doctor.memberStatus !== MemberStatus.ACTIVE ||
      doctor.deletedAt ||
      String(doctor.clinicId) !== String(row.clinicId) ||
      doctor.doctorClinicStatus !== DoctorClinicStatus.APPROVED ||
      !Array.isArray(doctor.doctorSpecializations) ||
      !doctor.doctorSpecializations.includes(specialty as DoctorSpecialization)
    )
      issue('INELIGIBLE_ACTIVE_PARTICIPANT');
    if (
      clinic &&
      typeof clinic.clinicTimezone === 'string' &&
      clinic.clinicTimezone.trim()
    ) {
      try {
        appointmentSlot(row.startsAt, clinic.clinicTimezone);
      } catch {
        issue('INVALID_SLOT');
      }
    } else issue('INVALID_SLOT');
    commitments.push({
      kind: 'APPOINTMENT',
      commitmentId: row._id,
      patientId: row.patientId,
      doctorId: row.doctorId,
      clinicId: row.clinicId,
      specialty: specialty as DoctorSpecialization,
      startsAt: row.startsAt,
      endsAt: row.endsAt,
      version: update.version,
      status: status as 'PENDING' | 'CONFIRMED',
    });
  }
  const slots = new Set<string>();
  const patients = new Map<string, BookingCommitment[]>();
  for (const entry of commitments) {
    const key = `${entry.doctorId}:${entry.startsAt.getTime()}`;
    if (slots.has(key))
      issues.push({
        appointmentId: String(entry.commitmentId),
        code: 'DUPLICATE_ACTIVE_SLOT',
      });
    slots.add(key);
    const own = patients.get(String(entry.patientId)) ?? [];
    own.push(entry);
    patients.set(String(entry.patientId), own);
  }
  for (const own of patients.values()) {
    own.sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
    for (let i = 0; i < own.length; i++)
      for (let j = i + 1; j < own.length; j++) {
        const a = own[i],
          b = own[j];
        const diff = b.startsAt.getTime() - a.startsAt.getTime();
        if (diff >= 24 * 3600_000) break;
        if (
          String(a.clinicId) === String(b.clinicId) &&
          a.specialty === b.specialty
        )
          issues.push({
            appointmentId: String(b.commitmentId),
            code: 'COMMITMENT_CONFLICT',
          });
        if (a.endsAt > b.startsAt)
          issues.push({
            appointmentId: String(b.commitmentId),
            code: 'PATIENT_OVERLAP',
          });
      }
  }
  return { issues, updates, commitments, auditChanges };
}
