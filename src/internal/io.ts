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

const effectObj = (type, payload) => ({[IO]: true, [type]: payload})

export function take(channel = '*') {
  if (arguments.length) {
    check(arguments[0], is.notUndef, 'take(channel): channel is undefined')
  }
  if (is.channel(channel)) {
    return effectObj(TAKE, { channel })
  }
  throw new Error(`take(channel): argument ${String(channel)} is not valid channel or a valid pattern`)
}

export function race(effects) {
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

export function call(fn, ...args) {
  return effectObj(CALL, getFnCallDesc('call', fn, args))
}

export function apply(context, fn, args = []) {
  return effectObj(CALL, getFnCallDesc('apply', {context, fn}, args))
}

export function cps(fn, ...args) {
  return effectObj(CPS, getFnCallDesc('cps', fn, args))
}

export function fork(fn, ...args) {
  return effectObj(FORK, getFnCallDesc('fork', fn, args))
}

export function spawn(fn, ...args) {
  const eff = fork(fn, ...args)
  eff[FORK].detached = true
  return eff
}

const isForkedTask = task => task[TASK]

export function join(task) {
  check(task, is.notUndef, 'join(task): argument task is undefined')
  if (!isForkedTask(task)) {
    throw new Error(`join(task): argument ${task} is not a valid Task object`)
  }

  return effectObj(JOIN, task)
}

export function cancel(task) {
  check(task, is.notUndef, 'cancel(task): argument task is undefined')
  if (!isForkedTask(task)) {
    throw new Error(`cancel(task): argument ${task} is not a valid Task object`)
  }

  return effectObj(CANCEL, task)
}

export function cancelled() {
  return effectObj(CANCELLED, {})
}

export function flush(channel) {
  check(channel, is.channel, `flush(channel): argument ${channel} is not valid channel`)
  return effectObj(FLUSH, channel)
}

export const asEffect = {
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
