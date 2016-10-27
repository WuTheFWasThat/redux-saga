# API Reference

* [`Effect creators`](#effect-creators)
  * [`take(channel)`](#takechannel)
  * [`call(fn, ...args)`](#callfn-args)
  * [`call([context, fn], ...args)`](#callcontext-fn-args)
  * [`apply(context, fn, args)`](#applycontext-fn-args)
  * [`cps(fn, ...args)`](#cpsfn-args)
  * [`cps([context, fn], ...args)`](#cpscontext-fn-args)
  * [`fork(fn, ...args)`](#forkfn-args)
  * [`fork([context, fn], ...args)`](#forkcontext-fn-args)
  * [`spawn(fn, ...args)`](#spawnfn-args)
  * [`spawn([context, fn], ...args)`](#spawncontext-fn-args)
  * [`join(task)`](#jointask)
  * [`cancel(task)`](#canceltask)
  * [`flush(channel)`](#flushchannel)
  * [`cancelled()`](#cancelled)
* [`Effect combinators`](#effect-combinators)
  * [`race(effects)`](#raceeffects)
  * [`[...effects] (aka parallel effects)`](#effects-parallel-effects)
* [`Interfaces`](#interfaces)
  * [`Task`](#task)
  * [`Channel`](#channel)
  * [`Buffer`](#buffer)
  * [`SagaMonitor`](#sagamonitor)
* [`Utils`](#utils)
  * [`channel([buffer])`](#channelbuffer)
  * [`eventChannel(subscribe, [buffer], matcher)`](#eventchannelsubscribe-buffer-matcher)
  * [`buffers`](#buffers)
  * [`delay(ms, [val])`](#delayms-val)

## Effect creators

> Notes:

> - Each function below returns a plain JavaScript object and does not perform any execution.
> - The execution is performed by the saga runner during the Iteration process described above.
> - The saga runner examines each Effect description and performs the appropriate action.

### `take(channel)`

Creates an Effect description that instructs the saga runner to wait for a specified message from the provided Channel. If the channel is already closed, then the Generator will immediately terminate following the same process described above for `take(pattern)`.

### `call(fn, ...args)`

Creates an Effect description that instructs the saga runner to call the function `fn` with `args` as arguments.

- `fn: Function` - A Generator function, or normal function which either returns a Promise as result, or any other value.

- `args: Array<any>` - An array of values to be passed as arguments to `fn`

#### Notes

`fn` can be either a *normal* or a Generator function.

The saga runner invokes the function and examines its result.

If the result is an Iterator object, the saga runner will run that Generator function, just like he did with the
startup Generators (passed to the saga runner on startup). The parent Generator will be
suspended until the child Generator terminates normally, in which case the parent Generator
is resumed with the value returned by the child Generator. Or until the child aborts with some
error, in which case an error will be thrown inside the parent Generator.

If the result is a Promise, the saga runner will suspend the Generator until the Promise is
resolved, in which case the Generator is resumed with the resolved value. or until the Promise
is rejected, in which case an error is thrown inside the Generator.

If the result is not an Iterator object nor a Promise, the saga runner will immediately return that value back to the saga,
so that it can resume its execution synchronously.

When an error is thrown inside the Generator. If it has a `try/catch` block surrounding the
current `yield` instruction, the control will be passed to the `catch` block. Otherwise,
the Generator aborts with the raised error, and if this Generator was called by another
Generator, the error will propagate to the calling Generator.

### `call([context, fn], ...args)`

Same as `call(fn, ...args)` but supports passing a `this` context to `fn`. This is useful to
invoke object methods.

### `apply(context, fn, [args])`

Alias for `call([context, fn], ...args)`.

### `cps(fn, ...args)`

Creates an Effect description that instructs the saga runner to invoke `fn` as a Node style function.

- `fn: Function` - a Node style function. i.e. a function which accepts in addition to its arguments,
an additional callback to be invoked by `fn` when it terminates. The callback accepts two parameters,
where the first parameter is used to report errors while the second is used to report successful results

- `args: Array<any>` - an array to be passed as arguments for `fn`

#### Notes

The saga runner will perform a call `fn(...arg, cb)`. The `cb` is a callback passed by the saga runner to
`fn`. If `fn` terminates normally, it must call `cb(null, result)` to notify thesaga runner
of a successful result. If `fn` encounters some error, then it must call `cb(error)` in order to
notify the saga runner that an error has occurred.

The saga runner remains suspended until `fn` terminates.

### `cps([context, fn], ...args)`

Supports passing a `this` context to `fn` (object method invocation)

### `fork(fn, ...args)`

Creates an Effect description that instructs the saga runner to perform a *non-blocking call* on `fn`

#### Arguments

- `fn: Function` - A Generator function, or normal function which returns a Promise as result

- `args: Array<any>` - An array of values to be passed as arguments to `fn`

returns a [Task](#task) object.

#### Note

`fork`, like `call`, can be used to invoke both normal and Generator functions. But, the calls are
non-blocking, the saga runner doesn't suspend the Generator while waiting for the result of `fn`.
Instead as soon as `fn` is invoked, the Generator resumes immediately.

`fork`, alongside `race`, is a central Effect for managing concurrency between Sagas.

The result of `yield fork(fn ...args)` is a [Task](#task) object.  An object with some useful
methods and properties.

All forked tasks are *attached* to their parents. When the parent terminates the execution of its
own body of instructions, it will wait for all forked tasks to terminate before returning.

Errors from child tasks automatically bubble up to their parents. If any forked task raises an uncaught error, then
the parent task will abort with the child Error, and the whole Parent's execution tree (i.e. forked tasks + the
*main task* represented by the parent's body if it's still running) will be cancelled.

Cancellation of a forked Task will automatically cancel all forked tasks that are still executing. It'll
also cancel the current Effect where the cancelled task was blocked (if any).

If a forked task fails *synchronously* (ie: fails immediately after its execution before performing any
async operation), then no Task is returned, instead the parent will be aborted as soon as possible (since both
parent and child executes in parallel, the parent will abort as soon as it takes notice of the child failure).

To create *detached* forks, use `spawn` instead.

### `fork([context, fn], ...args)`

Supports invoking forked functions with a `this` context

### `spawn(fn, ...args)`

Same as `fork(fn, ...args)` but creates a *detached* task. A detached task remains independent from its parent and acts like
a top-level task. The parent will not wait for detached tasks to terminate before returning and all events which may affect the
parent or the detached task are completely independents (error, cancellation).

### `spawn([context, fn], ...args)`

Supports spawning functions with a `this` context

### `join(task)`

Creates an Effect description that instructs the saga runner to wait for the result
of a previously forked task.

- `task: Task` - A [Task](#task) object returned by a previous `fork`

#### Notes

`join` will resolve to the same outcome of the joined task (success or error). If the joined
the task is cancelled, the cancellation will also propagate to the Saga executing the join effect
effect. Similarly, any potential callers of those joiners will be cancelled as well.

### `cancel(task)`

Creates an Effect description that instructs the saga runner to cancel a previously forked task.

- `task: Task` - A [Task](#task) object returned by a previous `fork`

#### Notes

To cancel a running task, the saga runner will invoke `return` on the underlying Generator
object. This will cancel the current Effect in the task and jump to the finally block (if defined).

Inside the finally block, you can execute any cleanup logic or dispatch some action to keep the
store in a consistent state (e.g. reset the state of a spinner to false when an ajax request
is cancelled). You can check inside the finally block if a Saga was cancelled by issuing
a `yield cancelled()`.

Cancellation propagates downward to child sagas. When cancelling a task, the saga runner will also
cancel the current Effect (where the task is currently blocked). If the current Effect
is a call to another Saga, it will be also cancelled. When cancelling a Saga, all *attached
forks* (sagas forked using `yield fork()`) will be cancelled. This means that cancellation
effectively affects the whole execution tree that belongs to the cancelled task.

`cancel` is a non-blocking Effect. i.e. the Saga executing it will resume immediately after
performing the cancellation.

For functions which return Promise results, you can plug your own cancellation logic
by attaching a `[CANCEL]` to the promise.

The following example shows how to attach cancellation logic to a Promise result:

```javascript
import { CANCEL } from 'redux-saga'
import { fork, cancel } from 'redux-saga/effects'

function myApi() {
  const promise = myXhr(...)

  promise[CANCEL] = () => myXhr.abort()
  return promise
}

function* mySaga() {

  const task = yield fork(myApi)

  // ... later
  // will call promise[CANCEL] on the result of myApi
  yield cancel(task)
}
```

### `flush(channel)`

Creates an effect that instructs the saga runner to flush all buffered items from the channel. Flushed items are returned back to the saga, so they can be utilized if needed.

- `channel: Channel` - a [`Channel`](#channel) Object.

#### Example

```javascript

function* saga() {
  const chan = yield actionChannel('ACTION')

  try {
    while (true) {
      const action = yield take(chan)
      // ...
    }
  } finally {
    const actions = yield flush(chan)
    // ...
  }

}
```

### `cancelled()`

Creates an effect that instructs the saga runner to return whether this generator has been cancelled. Typically
you use this Effect in a finally block to run Cancellation specific code

#### Example

```javascript

function* saga() {
  try {
    // ...
  } finally {
    if (yield cancelled()) {
      // logic that should execute only on Cancellation
    }
    // logic that should execute in all situations (e.g. closing a channel)
  }
}
```

## Effect combinators

### `race(effects)`

Creates an Effect description that instructs the saga runner to run a *Race* between
multiple Effects (this is similar to how `Promise.race([...])` behaves).

`effects: Object` - a dictionary Object of the form {label: effect, ...}

#### Example

The following example runs a race between two effects:

1. A call to a function `fetchUsers` which returns a Promise
2. A `CANCEL_FETCH` action which may be eventually dispatched on the Store

```javascript
import { take, call } from `redux-saga/effects`
import fetchUsers from './path/to/fetchUsers'

function* fetchUsersSaga {
  const { response, cancel } = yield race({
    response: call(fetchUsers),
    cancel: take(CANCEL_FETCH)
  })
}
```

If `call(fetchUsers)` resolves (or rejects) first, the result of `race` will be an object
with a single keyed object `{response: result}` where `result` is the resolved result of `fetchUsers`.

If an action of type `CANCEL_FETCH` is dispatched on the Store before `fetchUsers` completes, the result
will be a single keyed object `{cancel: action}`, where action is the dispatched action.

#### Notes

When resolving a `race`, the saga runner automatically cancels all the losing Effects.

### `[...effects] (parallel effects)`

Creates an Effect description that instructs the saga runner to run multiple Effects
in parallel and wait for all of them to complete.

#### Example

The following example runs two blocking calls in parallel:

```javascript
import { fetchCustomers, fetchProducts } from './path/to/api'

function* mySaga() {
  const [customers, products] = yield [
    call(fetchCustomers),
    call(fetchProducts)
  ]
}
```

#### Notes

When running Effects in parallel, the saga runner suspends the Generator until one of the following occurs:

- All the Effects completed with success: resumes the Generator with an array containing the results of all Effects.

- One of the Effects was rejected before all the effects complete: throws the rejection error inside the Generator.

## Interfaces

### Task

The Task interface specifies the result of running a Saga using `fork`.

<table id="task-descriptor">
  <tr>
    <th>method</th>
    <th>return value</th>
  </tr>
  <tr>
    <td>task.isRunning()</td>
    <td>true if the task hasn't yet returned or thrown an error</td>
  </tr>
  <tr>
    <td>task.isCancelled()</td>
    <td>true if the task has been cancelled</td>
  </tr>
  <tr>
    <td>task.result()</td>
    <td>task return value. `undefined` if task is still running</td>
  </tr>
  <tr>
    <td>task.error()</td>
    <td>task thrown error. `undefined` if task is still running</td>
  </tr>
  <tr>
    <td>task.done</td>
    <td>
      a Promise which is either:
        <ul>
          <li>resolved with task's return value</li>
          <li>rejected with task's thrown error</li>
        </ul>
      </td>
  </tr>
  <tr>
    <td>task.cancel()</td>
    <td>Cancels the task (If it is still running)</td>
  </tr>
</table>

### Channel

A channel is an object used to send and receive messages between tasks. Messages from senders are queued until an interested receiver request a message, and registered receiver is queued until a message is disponible.

Every channel has an underlying buffer which defines the buffering strategy (fixed size, dropping, sliding)

The Channel interface defines 3 methods: `take`, `put` and `close`

`Channel.take(callback):` used to register a taker. The take is resolved using the following rules

- If the channel has buffered messages, then `callback` will be invoked with the next message from the underlying buffer (using `buffer.take()`)
- If the channel is closed and there are no buffered messages, then `callback` is invoked with `END`
- Otherwise`callback` will be queued until a message is put into the channel

`Channel.put(message):` Used to put message on the buffer. The put will be handled using the following rules

- If the channel is closed, then the put will have no effect.
- If there are pending takers, then invoke the oldest taker with the message.
- Otherwise put the message on the underlying buffer

`Channel.flush():` Used to extract all buffered messages from the channel. It empties the channel.

`Channel.close():` closes the channel which means no more puts will be allowed. If there are pending takers and no buffered messages, then all takers will be invoked with `END`. If there are buffered messages, then those messages will be delivered first to takers until the buffer become empty. Any remaining takers will be then invoked with `END`.


### Buffer

Used to implement the buffering strategy for a channel. The Buffer interface defines 3 methods: 'isEmpty', `put` and `take`

- `isEmpty()`: returns true if there are no messages on the buffer. A channel calls this method whenever a new taker is registered
- `put(message)`: used to put new message in the buffer. Note the Buffer can chose to not store the message
(e.g. a dropping buffer can drop any new message exceeding a given limit)
- `take()` used to retrieve any buffered message. Note the behavior of this method has to be consistent with `isEmpty`

### SagaMonitor

Used by the saga runner to dispatch monitoring events. Actually the saga runner dispatches 4 events:

- When an effect is triggered (via `yield someEffect`) the saga runner invokes `sagaMonitor.effectTriggered`

- If the effect is resolved with success the saga runner invokes `sagaMonitor.effectResolved`

- If the effect is rejected with an error the saga runner invokes `sagaMonitor.effectRejected`

- finally is the effect is cancelled the saga runner invokes `sagaMonitor.effectCancelled`

Below the signature for each method

- `effectTriggered(options)` : where options is an object with the following fields

  - `effectId` : Number - Unique ID assigned to the yielded effect

  - `parentEffectId` : Number - ID of the parent Effect. In the case of a `race` or `parallel` effect, all
  effects yielded inside will have the direct race/parallel effect as a parent. In case of a top-level effect, the
  parent will be the containing Saga

  - `label` : String - In case of a `race` effect, all child effects will be assigned as label the corresponding
  keys of the object passed to `race`

  - `effect` : Object - the yielded effect itself

- `effectResolved(effectId, result)`

    - `effectId` : Number - The ID of the yielded effect

    - `result` : any - The result of the successful resolution of the effect

- `effectRejected(effectId, error)`

    - `effectId` : Number - The ID of the yielded effect

    - `error` : any - Error raised with the rejection of the effect


- `effectCancelled(effectId)`

    - `effectId` : Number - The ID of the yielded effect


## Utils

### `channel([buffer])`

A factory method that can be used to create Channels. You can optionally pass it a buffer
to control how the channel buffers the messages.

By default, if no buffer is provided, the channel will queue incoming messages up to 10 until interested takers are registered. The default buffering will deliver message using a FIFO strategy: a new taker will be delivered the oldest message in the buffer.

### `eventChannel(subscribe, [buffer], [matcher])`

Creates channel that will subscribe to an event source using the `subscribe` method. Incoming events from the event source will be queued in the channel until interested takers are registered.

- `subscribe: Function` used to subscribe to the underlying event source. The function must return an unsubscribe function to terminate the subscription.

- `buffer: Buffer` optional Buffer object to buffer messages on this channel. If not provided messages will not buffered
on this channel.

- `matcher: Function` optional predicate function (`any => Boolean`) to filter incoming messages. Only messages accepted by
the matcher will be put on the channel.

To notify the channel that the event source has terminated, you can notify the provided subscriber with an `END`

#### Example

In the following example we create an event channel that will subscribe to a `setInterval`

```javascript
const countdown = (secs) => {
  return eventChannel(emitter => {
      const iv = setInterval(() => {
        console.log('countdown', secs)
        secs -= 1
        if (secs > 0) {
          emitter(secs)
        } else {
          emitter(END)
          clearInterval(iv)
          console.log('countdown terminated')
        }
      }, 1000);
      return () => {
        clearInterval(iv)
        console.log('countdown cancelled')
      }
    }
  )
}
```

### `buffers`

Provides some common buffers

- `buffers.none()`: no buffering, new messages will be lost if there are no pending takers

- `buffers.fixed(limit)`: new messages will be buffered up to `limit`. Overflow will raises an Error. Omitting a `limit` value will result in a limit of 10.

- `buffers.expanding(initialSize)`: like `fixed` but Overflow will cause the buffer to expand dynamically.

- `buffers.dropping(limit)`: same as `fixed` but Overflow will silently drop the messages.

- `buffers.sliding(limit)`: same as `fixed` but Overflow will insert the new message at the end and drop the oldest message in the buffer.

### `delay(ms, [val])`

Returns a Promise that will resolve after `ms` milliseconds with `val`.
