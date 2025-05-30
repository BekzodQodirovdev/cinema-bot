import { Injectable } from '@nestjs/common';
import { UserState, BotStep } from './interfaces/bot-state.interface';

@Injectable()
export class StateService {
  private userStates: Map<number, UserState> = new Map();

  getUserState(userId: number): UserState {
    if (!this.userStates.has(userId)) {
      this.userStates.set(userId, {
        step: BotStep.WAITING_FOR_MOVIE_INFO,
        tempData: {}
      });
    }
    return this.userStates.get(userId)!;
  }

  setUserStep(userId: number, step: BotStep) {
    const state = this.getUserState(userId);
    state.step = step;
    this.userStates.set(userId, state);
  }

  setTempData(userId: number, data: Partial<UserState['tempData']>) {
    const state = this.getUserState(userId);
    state.tempData = { ...state.tempData, ...data };
    this.userStates.set(userId, state);
  }

  clearUserState(userId: number) {
    this.userStates.set(userId, {
      step: BotStep.WAITING_FOR_MOVIE_INFO,
      tempData: {}
    });
  }
} 