import {
  Effect, TakeEffectDescriptor,
  RaceEffectDescriptor, CallEffectDescriptor, ForkEffectDescriptor,
} from './effects';


export const asEffect: {
  take<T>(effect: Effect): TakeEffectDescriptor<T>;
  race(effect: Effect): RaceEffectDescriptor;
  call(effect: Effect): CallEffectDescriptor;
  cps(effect: Effect): CallEffectDescriptor;
  fork(effect: Effect): ForkEffectDescriptor;
  join(effect: Effect): Task;
  cancel(effect: Effect): Task;
  cancelled(effect: Effect): {};
};
