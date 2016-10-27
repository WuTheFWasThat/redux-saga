import { noop, is, log as _log, check, deferred, autoInc, remove, TASK, CANCEL, makeIterator } from './utils'
import { asEffect } from './io'
import { isEnd } from './channel'

export const NOT_ITERATOR_ERROR = 'proc first argument (Saga function result) must be an iterator'

const nextEffectId = autoInc()
export const CHANNEL_END = {toString() { return '@@redux-saga/CHANNEL_END' }}
export const TASK_CANCEL = {toString() { return '@@redux-saga/TASK_CANCEL' }}

/**
 *  Used to track a parent task and its forks
 *  In the new fork model, forked tasks are attached by default to their parent
 *  We model this using the concept of Parent task && main Task
 *  main task is the main flow of the current Generator, the parent tasks is the
 *  aggregation of the main tasks + all its forked tasks.
 *  Thus the whole model represents an execution tree with multiple branches (vs the
 *  linear execution tree in sequential (non parallel) programming)
 *
 *  A parent tasks has the following semantics
 *  - It completes iff all its forks either complete or all cancelled
 *  - If it's cancelled, all forks are cancelled as well
 *  - It aborts if any uncaught error bubbles up from forks
 *  - If it completes, the return value is the one returned by the main task
 */

// TODO
type Task = any;

function forkQueue(name, mainTask: Task, cb) {
  let tasks: Array<Task> = []
  let result
  let completed = false
  addTask(mainTask)

  function abort(err) {
    cancelAll()
    cb(err, true)
  }

  function addTask(task) {
    tasks.push(task)
    task.cont = (res, isErr) => {
      if (completed) {
        return
      }

      remove(tasks, task)
      task.cont = noop
      if (isErr) {
        abort(res)
      } else {
        if (task === mainTask) {
          result = res
        }
        if (!tasks.length) {
          completed = true
          cb(result)
        }
      }
    }
    // task.cont.cancel = task.cancel
  }

  function cancelAll() {
    if (completed) {
      return
    }
    completed = true
    tasks.forEach(t => {
      t.cont = noop
      t.cancel()
    })
    tasks = []
  }

  return {
    addTask,
    cancelAll,
    abort,
    getTasks: () => tasks,
    taskNames: () => tasks.map(t => t.name),
  }
}

function createTaskIterator({context, fn, args}) {
  if (is.iterator(fn)) {
    return fn
  }

  // catch synchronous failures; see #152 and #441
  let result, error
  try {
    result = fn.apply(context, args)
  } catch (err) {
    error = err
  }

  // i.e. a generator function returns an iterator
  if (is.iterator(result)) {
    return result
  }

  // do not bubble up synchronous failures for detached forks
  // instead create a failed task. See #152 and #441
  return error
    ? makeIterator(() => { throw error })
    : makeIterator((function() {
        let pc
        const eff = {done: false, value: result}
        const ret = value => ({done: true, value})
        return arg => {
          if (!pc) {
            pc = true
            return eff
          } else {
            return ret(arg)
          }
        }
      })())
}

export default function proc(
  iterator,
  options: any = {},
  parentEffectId = 0,
  name = 'anonymous',
  cont?
) {
  check(iterator, is.iterator, NOT_ITERATOR_ERROR)

  const {sagaMonitor, logger, onError} = options
  const log = logger || _log

  /*
   * Creates a new task descriptor for this generator, We'll also create a main task
   * to track the main flow (besides other forked tasks)
   */
  const task: Task = newTask(parentEffectId, name, iterator, cont)
  const mainTask: Task = {name, cancel: cancelMain, isRunning: true}
  const taskQueue = forkQueue(name, mainTask, end)

  /*
   * This is the generator driver
   * It's a recursive async/continuation function which calls itself
   * until the generator terminates or throws
   */
  const next: any = (arg, isErr) => {
    // Preventive measure. If we end up here, then there is really something wrong
    if (!mainTask.isRunning) {
      throw new Error('Trying to resume an already finished generator')
    }

    try {
      let result
      if (isErr) {
        result = iterator.throw(arg)
      } else if (arg === TASK_CANCEL) {
        /*
         * getting TASK_CANCEL autoamtically cancels the main task
         * We can get this value here

         * - By cancelling the parent task manually
         * - By joining a Cancelled task
         */
        mainTask.isCancelled = true
        // Cancels the current effect; this will propagate the cancellation down to any called tasks
        next.cancel()
        // If this Generator has a `return` method then invokes it
        // This will jump to the finally block
        result = is.func(iterator.return) ? iterator.return(TASK_CANCEL) : {done: true, value: TASK_CANCEL}
      } else if (arg === CHANNEL_END) {
        // We get CHANNEL_END by taking from a channel that ended using `take` (and not `takem` used to trap End of channels)
        result = is.func(iterator.return) ? iterator.return() : {done: true}
      } else {
        result = iterator.next(arg)
      }

      if (!result.done) {
         runEffect(result.value, parentEffectId, '', next)
      } else {
        // This Generator has ended, terminate the main task and notify the fork queue
        mainTask.isMainRunning = false
        if (mainTask.cont) {
          mainTask.cont(result.value)
        }
      }
    } catch (error) {
      if (mainTask.isCancelled) {
        log('error', `uncaught at ${name}`, error.message)
      }
      mainTask.isMainRunning = false
      mainTask.cont(error, true)
    }
  }
  /*
   * Tracks the current effect cancellation
   * Each time the generator progresses. calling runEffect will set a new value
   * on it. It allows propagating cancellation to child effects
   */
  next.cancel = noop

  function end(result, isErr = false) {
    iterator._isRunning = false
    if (!isErr) {
      if (result === TASK_CANCEL /* && isDev */) {
        log('info', `${name} has been cancelled`, '')
      }
      iterator._result = result
      if (iterator._deferredEnd) {
        iterator._deferredEnd.resolve(result)
      }
    } else {
      let errored = false;
      if (result instanceof Error) {
        errored = true;
      }
      if (errored) {
        result.sagaStack = `at ${name} \n ${result.sagaStack || result.stack}`
      }
      if (!task.cont) {
        log('error', `uncaught`, result.sagaStack || result.stack)
        if ((result instanceof Error) && onError) {
          onError(result)
        }
      }
      iterator._error = result
      iterator._isAborted = true
      if (iterator._deferredEnd) {
        iterator._deferredEnd.reject(result)
      }
    }
    if (task.cont) {
      task.cont(result, isErr)
    }
    task.joiners.forEach(j => j.cb(result, isErr))
    task.joiners = null
  }

  function runEffect(effect, parentEffectId2, label = '', cb) {
    const effectId = nextEffectId()
    if (sagaMonitor) {
      sagaMonitor.effectTriggered({effectId, parentEffectId2, label, effect})
    }

    /*
     * completion callback and cancel callback are mutually exclusive
     * We can't cancel an already completed effect
     * And We can't complete an already cancelled effectId
     */
    let effectSettled

    // Completion callback passed to the appropriate effect runner
    const currCb: any = (res, isErr) => {
      if (effectSettled) {
        return
      }

      effectSettled = true
      cb.cancel = noop // defensive measure
      if (sagaMonitor) {
        isErr ?
          sagaMonitor.effectRejected(effectId, res)
        : sagaMonitor.effectResolved(effectId, res)
      }

      cb(res, isErr)
    }
    // tracks down the current cancel
    currCb.cancel = noop

    // setup cancellation logic on the parent cb
    cb.cancel = () => {
      // prevents cancelling an already completed effect
      if (effectSettled) {
        return
      }

      effectSettled = true
      /*
       * propagates cancel downward
       * catch uncaught cancellations errors; since we can no longer call the completion
       * callback, log errors raised during cancellations into the console
       */
      try {
        currCb.cancel()
      } catch (err) {
        log('error', `uncaught at ${name}`, err.message)
      }
      currCb.cancel = noop // defensive measure

      if (sagaMonitor) {
        sagaMonitor.effectCancelled(effectId)
      }
    }

    /*
     * each effect runner must attach its own logic of cancellation to the provided callback
     * it allows this generator to propagate cancellation downward.

     * ATTENTION! effect runners must setup the cancel logic by setting cb.cancel = [cancelMethod]
     * And the setup must occur before calling the callback

     * This is a sort of inversion of control: called async functions are responsible
     * of completing the flow by calling the provided continuation; while caller functions
     * are responsible for aborting the current flow by calling the attached cancel function

     * Library users can attach their own cancellation logic to promises by defining a
     * promise[CANCEL] method in their returned promises
     * ATTENTION! calling cancel must have no effect on an already completed or cancelled effect
     */
    let data
    return (
      // Non declarative effect
        is.promise(effect)                                   ? resolvePromise(effect, currCb)
      : is.helper(effect)                                    ? runForkEffect({fn: effect}, effectId, currCb)
      : is.iterator(effect)                                  ? resolveIterator(effect, effectId, name, currCb)


      // declarative effects
      : is.array(effect)                                     ? runParallelEffect(effect, effectId, currCb)
      : (is.notUndef(data = asEffect.take(effect)))          ? runTakeEffect(data, currCb)
      : (is.notUndef(data = asEffect.race(effect)))          ? runRaceEffect(data, effectId, currCb)
      : (is.notUndef(data = asEffect.call(effect)))          ? runCallEffect(data, effectId, currCb)
      : (is.notUndef(data = asEffect.cps(effect)))           ? runCPSEffect(data, currCb)
      : (is.notUndef(data = asEffect.fork(effect)))          ? runForkEffect(data, effectId, currCb)
      : (is.notUndef(data = asEffect.join(effect)))          ? runJoinEffect(data, currCb)
      : (is.notUndef(data = asEffect.cancel(effect)))        ? runCancelEffect(data, currCb)
      : (is.notUndef(data = asEffect.flush(effect)))         ? runFlushEffect(data, currCb)
      : (is.notUndef(data = asEffect.cancelled(effect)))     ? runCancelledEffect(data, currCb)
      : /* anything else returned as is        */              currCb(effect)
    )
  }

  function resolvePromise(promise, cb) {
    const cancelPromise = promise[CANCEL]
    if (typeof cancelPromise === 'function') {
      cb.cancel = cancelPromise
    }
    promise.then(
      cb,
      error => cb(error, true)
    )
  }

  function resolveIterator(iterator2, effectId, name2, cb) {
    proc(iterator2, options, effectId, name2, cb)
  }

  function runTakeEffect(opts: any, cb) {
    const {channel, pattern, maybe} = opts;
    const takeCb: any = inp => (
        inp instanceof Error  ? cb(inp, true)
      : isEnd(inp) && !maybe ? cb(CHANNEL_END)
      : cb(inp)
    )
    try {
      channel.take(takeCb, pattern)
    } catch (err) {
      return cb(err, true)
    }
    cb.cancel = takeCb.cancel
  }

  function runCallEffect({context, fn, args}, effectId, cb) {
    let result
    // catch synchronous failures; see #152
    try {
      result = fn.apply(context, args)
    } catch (error) {
      return cb(error, true)
    }
    return (
        is.promise(result)  ? resolvePromise(result, cb)
      : is.iterator(result) ? resolveIterator(result, effectId, fn.name, cb)
      : cb(result)
    )
  }

  function runCPSEffect({context, fn, args}, cb) {
    // CPS (ie node style functions) can define their own cancellation logic
    // by setting cancel field on the cb

    // catch synchronous failures; see #152
    try {
      const cpsCb: any = (err, res) => is.undef(err) ? cb(res) : cb(err, true);
      fn.apply(context, args.concat(cpsCb));
      if (cpsCb.cancel) {
        cb.cancel = () => cpsCb.cancel();
      }
    } catch (error) {
      return cb(error, true)
    }
  }

  function runForkEffect(opts: any, effectId, cb) {
    const {context, fn, args, detached} = opts;
    const taskIterator = createTaskIterator({context, fn, args})

    const task2 = proc(taskIterator, options, effectId, fn.name, (detached ? null : noop))

    if (detached) {
      cb(task2)
    } else {
      if (taskIterator._isRunning) {
        taskQueue.addTask(task2)
        cb(task2)
      } else if (taskIterator._error) {
        taskQueue.abort(taskIterator._error)
      } else {
        cb(task2)
      }
    }
    // Fork effects are non cancellables
  }

  function runJoinEffect(t, cb) {
    if (t.isRunning()) {
      const joiner = {task, cb}
      cb.cancel = () => remove(t.joiners, joiner)
      t.joiners.push(joiner)
    } else {
      t.isAborted() ? cb(t.error(), true) : cb(t.result())
    }
  }

  function runCancelEffect(task2, cb) {
    if (task2.isRunning()) {
      task2.cancel()
    }
    cb()
    // cancel effects are non cancellables
  }

  function runParallelEffect(effects, effectId, cb) {
    if (!effects.length) {
      return cb([])
    }

    let completedCount = 0
    let completed
    const results = Array(effects.length)

    function checkEffectEnd() {
      if (completedCount === results.length) {
        completed = true
        cb(results)
      }
    }

    const childCbs = effects.map((eff, idx) => {
        const chCbAtIdx: any = (res: Task, isErr) => {
          if (completed) {
            return
          }
          if (isErr || isEnd(res) || res === CHANNEL_END || res === TASK_CANCEL) {
            cb.cancel()
            cb(res, isErr)
          } else {
            results[idx] = res
            completedCount++
            checkEffectEnd()
          }
        }
        chCbAtIdx.cancel = noop
        return chCbAtIdx
    })

    cb.cancel = () => {
      if (!completed) {
        completed = true
        childCbs.forEach(chCb => chCb.cancel())
      }
    }

    effects.forEach((eff, idx) => runEffect(eff, effectId, idx, childCbs[idx]))
  }

  function runRaceEffect(effects, effectId, cb) {
    let completed
    const keys = Object.keys(effects)
    const childCbs = {}

    keys.forEach(key => {
      const chCbAtKey: any = (res: Task, isErr) => {
        if (completed) {
          return
        }

        if (isErr) {
          // Race Auto cancellation
          cb.cancel()
          cb(res, true)
        } else if (!isEnd(res) && res !== CHANNEL_END && res !== TASK_CANCEL) {
          cb.cancel()
          completed = true
          cb({[key]: res})
        }
      }
      chCbAtKey.cancel = noop
      childCbs[key] = chCbAtKey
    })

    cb.cancel = () => {
      // prevents unnecessary cancellation
      if (!completed) {
        completed = true
        keys.forEach(key => childCbs[key].cancel())
      }
    }
    keys.forEach(key => {
      if (completed) {
        return
      }
      runEffect(effects[key], effectId, key, childCbs[key])
    })
  }

  function runCancelledEffect(data, cb) {
    cb(!!mainTask.isCancelled)
  }

  function runFlushEffect(channel, cb) {
    channel.flush(cb)
  }

  function newTask(id, name2, iterator2, cont2) {
    iterator2._deferredEnd = null
    return {
      [TASK]: true,
      id,
      name2,
      get done() {
        if (iterator2._deferredEnd) {
          return iterator2._deferredEnd.promise
        } else {
          const def = deferred()
          iterator2._deferredEnd = def
          if (!iterator2._isRunning) {
            iterator2._error ? def.reject(iterator2._error) : def.resolve(iterator2._result)
          }
          return def.promise
        }
      },
      cont2,
      joiners: ([] as Array<any> | null),
      cancel,
      isRunning: () => iterator2._isRunning,
      isCancelled: () => iterator2._isCancelled,
      isAborted: () => iterator2._isAborted,
      result: () => iterator2._result,
      error: () => iterator2._error,
    }
  }

  // cancellation of the main task. We'll simply resume the Generator with a Cancel
  function cancelMain() {
    if (mainTask.isRunning && !mainTask.isCancelled) {
      mainTask.isCancelled = true
      next(TASK_CANCEL)
    }
  }

  /*
   * This may be called by a parent generator to trigger/propagate cancellation
   * cancel all pending tasks (including the main task), then end the current task.

   * Cancellation propagates down to the whole execution tree holded by this Parent task
   * It's also propagated to all joiners of this task and their execution tree/joiners

   * Cancellation is noop for terminated/Cancelled tasks tasks
   */
  function cancel() {
    /*
     * We need to check both Running and Cancelled status
     * Tasks can be Cancelled but still Running
     */
    if (iterator._isRunning && !iterator._isCancelled) {
      iterator._isCancelled = true
      taskQueue.cancelAll()
      // Ending with a Never result will propagate the Cancellation to all joiners
      end(TASK_CANCEL)
    }
  }
  /*
   * attaches cancellation logic to this task's continuation
   * this will permit cancellation to propagate down the call chain
   */
  if (cont) {
    cont.cancel = cancel
  }

  // tracks the running status
  iterator._isRunning = true

  // kicks up the generator
  next()

  // then return the task descriptor to the caller
  return task

}
