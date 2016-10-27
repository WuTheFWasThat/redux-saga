import { is, check } from './utils'
import proc from './proc'
import { Effect } from './io';
import { Task } from './types';

export type SagaIterator = IterableIterator<Effect|Effect[]>;

type Saga0 = () => SagaIterator;
type Saga1<T1> = (arg1: T1) => SagaIterator;
type Saga2<T1, T2> = (arg1: T1, arg2: T2) => SagaIterator;
type Saga3<T1, T2, T3> = (arg1: T1, arg2: T2, arg3: T3) => SagaIterator;
type Saga4<T1, T2, T3, T4> = (arg1: T1, arg2: T2, arg3: T3,
                              arg4: T4) => SagaIterator;
type SagaRest = (...args: any[]) => SagaIterator;

export interface Monitor {
  effectTriggered(desc: {
    effectId: number;
    parentEffectId: number;
    label: string;
    effect: Effect;
  }): void;

  effectResolved(effectId: number, res: any): void;
  effectRejected(effectId: number, err: any): void;
  effectCancelled(effectId: number): void;
}

export interface SagaRunner {
  (saga: Saga0): Task;
  <T1>(saga: Saga1<T1>,
          arg1: T1): Task;
  <T1, T2>(saga: Saga2<T1, T2>,
              arg1: T1, arg2: T2): Task;
  <T1, T2, T3>(saga: Saga3<T1, T2, T3>,
                  arg1: T1, arg2: T2, arg3: T3): Task;
  <T1, T2, T3, T4>(saga: Saga4<T1, T2, T3, T4>,
                      arg1: T1, arg2: T2, arg3: T3, arg4: T4): Task;
  (saga: SagaRest, ...args: any[]): Task;
}

type Options = {
  sagaMonitor?: Monitor
  logger?: any
  onerror?: any
}

export default function sagaRunnerFactory(options: Options = {}): SagaRunner {
  if (is.func(options)) {
    throw new Error(`You passed a function to the Saga Runner. You are likely trying to start a\
      Saga by directly passing it to the RunnerFactory.
    `)
  }

  if (options.logger && !is.func(options.logger)) {
    throw new Error('`options.logger` passed to the Saga Runner is not a function!')
  }

  if (options.onerror && !is.func(options.onerror)) {
    throw new Error('`options.onerror` passed to the Saga Runner is not a function!')
  }

  return function runSaga(saga, ...args) {
    check(saga, is.func, 'sagaRunner.run(saga, ...args): saga argument must be a Generator function!')
    return proc(
      saga(...args),
      options,
      0,
      saga.name
    )
  }
}
