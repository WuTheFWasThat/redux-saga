import { Channel, Task, Predicate } from './types';
import { sym, is, check, TASK } from './utils'

const IO      = sym('IO')
const TAKE    = 'TAKE'
const RACE    = 'RACE'
const CALL    = 'CALL'
const CPS     = 'CPS'
const FORK    = 'FORK'
const JOIN    = 'JOIN'
const CANCEL  = 'CANCEL'
const CANCELLED  = 'CANCELLED'
const FLUSH  = 'FLUSH'

const effectObj = (type, payload): any => ({[IO]: true, [type]: payload})

interface TakeEffectDescriptor<T> {
  pattern: Predicate<T>;
  channel: Channel<T>;
  maybe?: boolean;
}

interface TakeEffect<T> {
  TAKE: TakeEffectDescriptor<T>;
}

export function take<T>(
  channel: Channel<T>, pattern: Predicate<T> = () => true
): TakeEffect<T> {
  if (arguments.length) {
    check(arguments[0], is.notUndef, 'take(channel): channel is undefined')
  }
  if (is.channel(channel)) {
    return effectObj(TAKE, { channel, pattern })
  }
  throw new Error(`take(channel): argument ${String(channel)} is not valid channel`)
}

type RaceEffectDescriptor = {[key: string]: Effect};

interface RaceEffect {
  RACE: RaceEffectDescriptor;
}

export function race(effects: {[key: string]: Effect}): RaceEffect {
  return effectObj(RACE, effects)
}

function getFnCallDesc(meth, fn, args) {
  check(fn, is.notUndef, `${meth}: argument fn is undefined`)

  let context = null
  if (is.array(fn)) {
    [context, fn] = fn
  } else if (fn.fn) {
    ({context, fn} = fn)
  }
  check(fn, is.func, `${meth}: argument ${fn} is not a function`)

  return {context, fn, args}
}

interface CallEffectDescriptor {
  context: any;
  fn: Function;
  args: any[];
}


type CallFunc0 = () => any;
type CallFunc1<T1> = (arg1: T1) => any;
type CallFunc2<T1, T2> = (arg1: T1, arg2: T2) => any;
type CallFunc3<T1, T2, T3> = (arg1: T1, arg2: T2, arg3: T3) => any;
type CallFunc4<T1, T2, T3, T4> = (arg1: T1, arg2: T2, arg3: T3,
                                  arg4: T4) => any;
type CallFunc5<T1, T2, T3, T4, T5> = (arg1: T1, arg2: T2, arg3: T3,
                                      arg4: T4, arg5: T5) => any;
type CallFuncRest = (...args: any[]) => any;

type CallEffectArg<F> = F | [any, F] | {context: any, fn: F};


interface CallEffectFactory<R> {
  (fn: CallEffectArg<CallFunc0>): R;
  <T1>(fn: CallEffectArg<CallFunc1<T1>>,
       arg1: T1): R;
  <T1, T2>(fn: CallEffectArg<CallFunc2<T1, T2>>,
           arg1: T1, arg2: T2): R;
  <T1, T2, T3>(fn: CallEffectArg<CallFunc3<T1, T2, T3>>,
               arg1: T1, arg2: T2, arg3: T3): R;
  <T1, T2, T3, T4>(fn: CallEffectArg<CallFunc4<T1, T2, T3, T4>>,
                   arg1: T1, arg2: T2, arg3: T3, arg4: T4): R;
  (fn: CallEffectArg<CallFuncRest>, ...args: any[]): R;
}


interface CallEffect {
  CALL: CallEffectDescriptor;
}

export const call: CallEffectFactory<CallEffect> = (fn, ...args) => {
  return effectObj(CALL, getFnCallDesc('call', fn, args))
}

export function apply(context, fn, args): CallEffect {
  return effectObj(CALL, getFnCallDesc('apply', {context, fn}, args))
}

interface CpsEffect {
  CPS: CallEffectDescriptor;
}

/*
type CpsCallback = (error: any, result: any) => void;

export function cps(fn: CallEffectArg<CallFunc1<CpsCallback>>): CpsEffect;
export function cps<T1>(fn: CallEffectArg<CallFunc2<T1, CpsCallback>>,
                        arg1: T1): CpsEffect;
export function cps<T1, T2>(fn: CallEffectArg<CallFunc3<T1, T2, CpsCallback>>,
                            arg1: T1, arg2: T2): CpsEffect;
export function cps<T1, T2, T3>(
  fn: CallEffectArg<CallFunc4<T1, T2, T3, CpsCallback>>,
  arg1: T1, arg2: T2, arg3: T3): CpsEffect;
export function cps<T1, T2, T3, T4>(
  fn: CallEffectArg<CallFunc5<T1, T2, T3, T4, CpsCallback>>,
  arg1: T1, arg2: T2, arg3: T3, arg4: T4): CpsEffect;
*/

export function cps(fn, ...args): CpsEffect {
  return effectObj(CPS, getFnCallDesc('cps', fn, args))
}


interface ForkEffectDescriptor extends CallEffectDescriptor {
  detached?: boolean;
}

interface ForkEffect {
  FORK: ForkEffectDescriptor;
}

export const fork: CallEffectFactory<ForkEffect> = (fn, ...args) => {
  return effectObj(FORK, getFnCallDesc('fork', fn, args))
}

export const spawn: CallEffectFactory<ForkEffect> = (fn, ...args) => {
  const eff = fork(fn, ...args)
  eff[FORK].detached = true
  return eff
}

const isForkedTask = task => task[TASK]

interface JoinEffect {
  JOIN: Task;
}

export function join(task: Task): JoinEffect {
  check(task, is.notUndef, 'join(task): argument task is undefined')
  if (!isForkedTask(task)) {
    throw new Error(`join(task): argument ${task} is not a valid Task object`)
  }

  return effectObj(JOIN, task)
}

interface CancelEffect {
  CANCEL: Task;
}

export function cancel(task: Task): CancelEffect {
  check(task, is.notUndef, 'cancel(task): argument task is undefined')
  if (!isForkedTask(task)) {
    throw new Error(`cancel(task): argument ${task} is not a valid Task object`)
  }

  return effectObj(CANCEL, task)
}

interface CancelledEffect {
  CANCELLED: {};
}

export function cancelled(): CancelledEffect {
  return effectObj(CANCELLED, {})
}

interface FlushEffect {
  FLUSH: {};
}

export function flush(channel): FlushEffect {
  check(channel, is.channel, `flush(channel): argument ${channel} is not valid channel`)
  return effectObj(FLUSH, channel)
}

export type Effect =
  TakeEffect<any> |
  RaceEffect | CallEffect |
  CpsEffect | ForkEffect | JoinEffect | CancelEffect  | CancelledEffect
  | FlushEffect ;


type asEffectType = {
  take<T>(effect: Effect): TakeEffectDescriptor<T>
  race(effect: Effect): RaceEffectDescriptor
  call(effect: Effect): CallEffectDescriptor
  cps(effect: Effect): CallEffectDescriptor
  fork(effect: Effect): ForkEffectDescriptor
  join(effect: Effect): Task
  cancel(effect: Effect): Task
  cancelled(effect: Effect): {}
  flush(effect: Effect): {}
}

export const asEffect: asEffectType = {
  take    : effect => effect && effect[IO] && effect[TAKE],
  race    : effect => effect && effect[IO] && effect[RACE],
  call    : effect => effect && effect[IO] && effect[CALL],
  cps     : effect => effect && effect[IO] && effect[CPS],
  fork    : effect => effect && effect[IO] && effect[FORK],
  join    : effect => effect && effect[IO] && effect[JOIN],
  cancel  : effect => effect && effect[IO] && effect[CANCEL],
  cancelled  : effect => effect && effect[IO] && effect[CANCELLED],
  flush  : effect => effect && effect[IO] && effect[FLUSH],
}
