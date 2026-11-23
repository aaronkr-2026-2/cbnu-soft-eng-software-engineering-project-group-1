import { UseGuards } from '@nestjs/common';
import {
  Args,
  Context,
  GraphQLISODateTime,
  ID,
  Int,
  Mutation,
  Query,
  Resolver,
} from '@nestjs/graphql';
import {
  MemberAccessGuard,
  type AuthenticatedRequest,
} from '../auth/guards/member-access.guard.js';
import { AppointmentCommitmentService } from './appointment-commitment.service.js';
import { WaitlistService } from '../waitlist/waitlist.service.js';
import {
  JoinWaitlistInput,
  MyWaitlistInput,
  ReplaceCommitmentInput,
} from '../../libs/dto/waitlist/waitlist.input.js';
import {
  CommitmentResult,
  WaitlistOutput,
  WaitlistPage,
} from '../../libs/dto/waitlist/waitlist.js';

@Resolver(() => WaitlistOutput)
@UseGuards(MemberAccessGuard)
export class AppointmentCommitmentResolver {
  constructor(
    private readonly commitments: AppointmentCommitmentService,
    private readonly waitlists: WaitlistService,
  ) {}

  @Mutation(() => WaitlistOutput)
  joinWaitlist(
    @Args('input') input: JoinWaitlistInput,
    @Context('req') req: AuthenticatedRequest,
  ) {
    return this.commitments.join(input, req.member);
  }

  @Mutation(() => WaitlistOutput)
  leaveWaitlist(
    @Args('id', { type: () => ID }) id: string,
    @Context('req') req: AuthenticatedRequest,
  ) {
    return this.commitments.leave(id, req.member);
  }

  @Mutation(() => CommitmentResult)
  replaceCommitment(
    @Args('input') input: ReplaceCommitmentInput,
    @Context('req') req: AuthenticatedRequest,
  ) {
    return this.commitments.replace(input, req.member);
  }

  @Query(() => WaitlistOutput)
  async getWaitlist(
    @Args('id', { type: () => ID }) id: string,
    @Context('req') req: AuthenticatedRequest,
  ) {
    return this.waitlists.view(
      await this.waitlists.get(id, req.member),
      req.member,
    );
  }

  @Query(() => WaitlistPage)
  myWaitlist(
    @Args('input', { defaultValue: {} }) input: MyWaitlistInput,
    @Context('req') req: AuthenticatedRequest,
  ) {
    return this.waitlists.list(input, req.member);
  }

  @Query(() => Int)
  getWaitlistCount(
    @Args('doctorId', { type: () => ID }) doctorId: string,
    @Args('startsAt', { type: () => GraphQLISODateTime }) startsAt: Date,
    @Context('req') req: AuthenticatedRequest,
  ) {
    return this.waitlists.count(doctorId, startsAt, req.member);
  }
}
