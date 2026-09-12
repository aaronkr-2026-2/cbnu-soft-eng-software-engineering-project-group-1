import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import MemberSchema, { MEMBER_MODEL_NAME } from '../libs/schemas/member.model.js';

const mongoUri = process.env.MONGO_URI ??
  (process.env.NODE_ENV === 'production' ? process.env.MONGO_PROD : process.env.MONGO_DEV);

@Module({
  // Mirrors DatabaseModule's test-safe behavior. At runtime main.ts requires a
  // MongoDB URI, so the Member model is always registered in the API process.
  imports: mongoUri
    ? [MongooseModule.forFeature([{ name: MEMBER_MODEL_NAME, schema: MemberSchema }])]
    : [],
})
export class MembersModule {}
