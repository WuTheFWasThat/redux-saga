import * as test from 'tape'
import sagaRunnerFactory, { channel } from './src'
import { call, fork, take, join } from './src/effects'
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

test('proc input', assert => {
  const chan: Channel<string> = channel()

  let saga1Done = false
  let saga2Done = false
  let saga3Done = false
  let messageToPassFromThread1 = 'hello, from thread 1'

  function* saga1() {
    yield call(print, 'Hello world 1')
    yield call(sleep, 2000)
    yield call(print, 'waking thread 3')
    yield call(() => {
      chan.put(messageToPassFromThread1)
    })
    yield call(sleep, 1000)
    yield call(print, 'thread 1 done')
    saga1Done = true
  }

  function* saga2() {
    yield call(print, 'Hello world 2')
    yield call(sleep, 3000)
    yield call(print, 'yea 2')
    saga2Done = true
  }

  function* saga3(): SagaIterator {
    const message = yield take(chan)
    assert.equal(message, messageToPassFromThread1)
    yield call(print, `test 3 received message: ${message}`)
    saga3Done = true
  }

  function* test(): SagaIterator {
    const [task1, task2, task3] = yield [
      fork(saga1),
      fork(saga2),
      fork(saga3),
    ]
    yield join(task1)
    yield join(task2)
    yield join(task3)
    assert.true(saga1Done)
    assert.true(saga2Done)
    assert.true(saga3Done)
    assert.end()
  }
  sagaRunner(test)
})
