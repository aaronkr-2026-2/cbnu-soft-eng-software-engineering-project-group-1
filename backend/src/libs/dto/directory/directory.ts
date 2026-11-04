import { Field, Int, ObjectType } from '@nestjs/graphql';
import { Member } from '../member/member.js';

@ObjectType()
export class DoctorDirectoryPage {
  @Field(() => [Member]) entries: Member[];
  @Field(() => Int) total: number;
  @Field(() => Int) page: number;
  @Field(() => Int) limit: number;
}
