import type { Db, Document } from 'mongodb';
import type { Connection } from 'mongoose';
import MemberSchema, { MEMBER } from '../../schemas/member.model.js';
import { isValidUsername, normalizeUsername } from './member-username.js';
import {
  assertUsernameStorage,
  hasUsernameValidator,
  USERNAME_VALIDATOR,
} from './member-username-storage.js';

export type UsernameResolution = {
  memberId: string;
  expectedMemberNick: string | null;
  memberNick: string;
};

type Issue = { memberId: string; reason: string; memberNick?: unknown };
export function parseUsernameResolutions(value: unknown): UsernameResolution[] {
  if (!Array.isArray(value)) throw new Error('Resolutions must be an array');
  const ids = new Set<string>();
  return value.map((item: unknown) => {
    if (!item || typeof item !== 'object' || Array.isArray(item))
      throw new Error('Invalid resolution');
    const row = item as Record<string, unknown>;
    if (
      Object.keys(row).sort().join() !==
        'expectedMemberNick,memberId,memberNick' ||
      typeof row.memberId !== 'string' ||
      !/^[a-f\d]{24}$/i.test(row.memberId) ||
      (row.expectedMemberNick !== null &&
        typeof row.expectedMemberNick !== 'string') ||
      !isValidUsername(row.memberNick) ||
      ids.has(row.memberId.toLowerCase())
    ) {
      throw new Error('Invalid or duplicate resolution');
    }
    ids.add(row.memberId.toLowerCase());
    return {
      memberId: row.memberId.toLowerCase(),
      expectedMemberNick: row.expectedMemberNick as string | null,
      memberNick: row.memberNick as string,
    };
  });
}

// Raw reads are deliberate: Mongoose defaults must not hide missing legacy keys.
export async function auditUsernames(
  db: Db,
  decisions: UsernameResolution[] = [],
) {
  const resolutions = new Map(decisions.map((row) => [row.memberId, row]));
  const rows = await db
    .collection('members')
    .find(
      {},
      {
        projection: {
          memberNick: 1,
          memberNickNormalized: 1,
          authProvider: 1,
          googleId: 1,
          __v: 1,
        },
      },
    )
    .limit(100001)
    .toArray();
  if (rows.length > 100000)
    throw new Error(
      'Migration limit exceeded; plan a larger offline migration',
    );
  const issues: Issue[] = [];
  const info = await db
    .listCollections({ name: 'members' }, { nameOnly: false })
    .next();
  if (info?.options?.collation && info.options.collation.locale !== 'simple')
    issues.push({
      memberId: 'members',
      reason: 'UNSUPPORTED_COLLECTION_COLLATION',
    });
  const keys = new Map<string, string>();
  const targets = rows.map((row) => {
    const id = String(row._id);
    const decision = resolutions.get(id);
    resolutions.delete(id);
    const alreadyApplied =
      decision &&
      row.memberNick === decision.memberNick &&
      row.memberNickNormalized === normalizeUsername(decision.memberNick);
    if (
      decision &&
      !alreadyApplied &&
      (row.memberNick ?? null) !== decision.expectedMemberNick
    )
      issues.push({
        memberId: id,
        reason: 'STALE_RESOLUTION',
        memberNick: row.memberNick,
      });
    const memberNick = decision?.memberNick ?? row.memberNick;
    if (!isValidUsername(memberNick))
      issues.push({ memberId: id, reason: 'INVALID_USERNAME', memberNick });
    if (
      (row.authProvider === 'GOOGLE' || row.googleId) &&
      (typeof row.memberNick !== 'string' ||
        row.memberNickNormalized !== normalizeUsername(row.memberNick)) &&
      !decision
    )
      issues.push({
        memberId: id,
        reason: 'GOOGLE_REVIEW_REQUIRED',
        memberNick: row.memberNick,
      });
    const key =
      typeof memberNick === 'string' ? normalizeUsername(memberNick) : '';
    if (keys.has(key)) {
      issues.push({ memberId: id, reason: 'DUPLICATE_USERNAME', memberNick });
      issues.push({ memberId: keys.get(key)!, reason: 'DUPLICATE_USERNAME' });
    }
    keys.set(key, id);
    return { row, memberNick, key };
  });
  for (const memberId of resolutions.keys())
    issues.push({ memberId, reason: 'UNKNOWN_MEMBER' });
  return {
    summary: {
      members: rows.length,
      unresolved: issues.length,
      keyBackfills: targets.filter(
        ({ row, key }) => row.memberNickNormalized !== key,
      ).length,
      renames: targets.filter(
        ({ row, memberNick }) => row.memberNick !== memberNick,
      ).length,
    },
    issues,
    targets,
  };
}

export async function migrateUsernames(
  connection: Connection,
  decisions: UsernameResolution[],
  writersStopped: boolean,
) {
  if (!writersStopped) throw new Error('Apply requires stopped writers');
  const db = connection.db!;
  const audit = await auditUsernames(db, decisions);
  if (audit.issues.length)
    throw new Error('Resolve all username issues before apply');
  const info = await db
    .listCollections({ name: 'members' }, { nameOnly: false })
    .next();
  if (!info) await db.createCollection('members');
  const session = await connection.startSession();
  try {
    await session.withTransaction(async () => {
      for (const { row, memberNick, key } of audit.targets) {
        const renamed = row.memberNick !== memberNick;
        if (!renamed && row.memberNickNormalized === key) continue;
        const result = await db.collection('members').updateOne(
          {
            _id: row._id,
            memberNick: Object.hasOwn(row, 'memberNick')
              ? row.memberNick
              : { $exists: false },
            __v: row.__v ?? { $exists: false },
          },
          {
            $set: { memberNick, memberNickNormalized: key },
            ...(renamed ? { $inc: { __v: 1 } } : {}),
          },
          { session },
        );
        if (result.matchedCount !== 1)
          throw new Error('Member changed after audit; repeat dry run');
      }
    });
  } finally {
    await session.endSession();
  }
  // Never drop existing indexes or overwrite existing validation rules.
  await connection.model(MEMBER, MemberSchema).createIndexes();
  const previous: Document = info?.options?.validator ?? {};
  const validator = hasUsernameValidator(previous)
    ? previous
    : Object.keys(previous).length
      ? { $and: [previous, USERNAME_VALIDATOR] }
      : USERNAME_VALIDATOR;
  await db.command({
    collMod: 'members',
    validator,
    validationLevel: 'strict',
    validationAction: 'error',
  });
  await assertUsernameStorage(db);
  return (await auditUsernames(db)).summary;
}
