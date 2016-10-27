import sagaRunnerFactory, { channel} from './src'
import { call, fork, take } from './src/effects'
import { Channel } from './src/internal/types'
import { SagaIterator } from './src/internal/runner'

const sagaRunner = sagaRunnerFactory();

function* print(...args) {
  yield call(console.log, ...args)
}

function sleep(ns) {
  return new Promise((resolve) => {
    setTimeout(resolve, ns)
  })
}

const chan: Channel<string> = channel()

function* test1() {
  yield call(print, 'Hello world 1')
  yield call(sleep, 2000)
  yield call(print, 'waking thread 3')
  yield call(() => {
    chan.put('hello, from thread 1')
  })
  yield call(sleep, 1000)
  yield call(print, 'thread 1 done')
}

function* test2() {
  yield call(print, 'Hello world 2')
  yield call(sleep, 3000)
  yield call(print, 'yea 2')
}

function* test3(): SagaIterator {
  const message = yield take(chan)
  yield call(print, `test 3 received message: ${message}`)
}

function* test() {
  yield [
    fork(test1),
    fork(test2),
    fork(test3),
  ]
}
sagaRunner(test)

// function* test2() {
//   yield sleep(10000)
// }
// sagaRunner(test2)
