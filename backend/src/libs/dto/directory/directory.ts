import { Field, Int, ObjectType } from '@nestjs/graphql';
import { Member } from '../member/member.js';

@ObjectType({ isAbstract: true })
abstract class DirectoryPage {
  @Field(() => [Member]) entries: Member[];
  @Field(() => Int) total: number;
  @Field(() => Int) page: number;
  @Field(() => Int) limit: number;
}

@ObjectType()
export class DoctorDirectoryPage extends DirectoryPage {}

@ObjectType()
export class ClinicDirectoryPage extends DirectoryPage {}
