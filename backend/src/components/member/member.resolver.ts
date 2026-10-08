import { Args, ID, Query, Resolver } from '@nestjs/graphql';
import { Member } from '../../libs/dto/member/member.js';
import { MemberService } from './member.service.js';

@Resolver(() => Member)
export class MemberResolver {
  constructor(private readonly memberService: MemberService) {}

  @Query(() => Member)
  getMember(@Args('id', { type: () => ID }) id: string) {
    return this.memberService.getMember(id);
  }

  @Query(() => [Member])
  getClinics() {
    return this.memberService.listClinics();
  }

  @Query(() => [Member])
  getClinicDoctors(@Args('clinicId', { type: () => ID }) clinicId: string) {
    return this.memberService.listClinicDoctors(clinicId);
  }
}
