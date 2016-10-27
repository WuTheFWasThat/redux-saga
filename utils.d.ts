import {
  Effect, TakeEffectDescriptor,
  RaceEffectDescriptor, CallEffectDescriptor, ForkEffectDescriptor,
} from './effects';


interface Deferred<R> {
  resolve(result: R): void;
  reject(error: any): void;
  promise: Promise<R>; // tslint:disable-line member-ordering
}

export function deferred<T, R>(props?: T): T & Deferred<R>;

export function arrayOfDeffered<T>(length: number): Deferred<T>[];

interface MockTask extends Task {
  setRunning(running: boolean): void;
  setResult(result: any): void;
  setError(error: any): void;
}

export function createMockTask(): MockTask;

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
