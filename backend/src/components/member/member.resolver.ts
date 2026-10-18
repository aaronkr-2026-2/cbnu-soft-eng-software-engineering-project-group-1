import { Args, Context, ID, Mutation, Query, Resolver } from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import {
  MemberAccessGuard,
  type AuthenticatedRequest,
} from '../auth/guards/member-access.guard.js';
import { MemberUpdateInput } from '../../libs/dto/member/member-update.input.js';
import {
  Member,
  MemberSelf,
  MemberUpdateResult,
} from '../../libs/dto/member/member.js';
import { MemberService } from './member.service.js';

@Resolver(() => Member)
export class MemberResolver {
  constructor(private readonly memberService: MemberService) {}

  @UseGuards(MemberAccessGuard)
  @Query(() => MemberSelf)
  myProfile(@Context('req') request: AuthenticatedRequest) {
    return this.memberService.myProfile(request.member);
  }

  @UseGuards(MemberAccessGuard)
  @Mutation(() => MemberUpdateResult)
  updateMember(
    @Args('input') input: MemberUpdateInput,
    @Context('req') request: AuthenticatedRequest,
  ) {
    return this.memberService.updateMember(request.member, input);
  }

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

  @Query(() => [Member])
  getDoctors() {
    return this.memberService.listDoctors();
  }
}
