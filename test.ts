import sagaRunnerFactory from './src'
import { call } from './src/effects'

const sagaRunner = sagaRunnerFactory();

function* print(...args) {
  yield call(console.log, ...args)
}

function sleep(ns) {
  return new Promise((resolve) => {
    setTimeout(resolve, ns)
  })
}

function* test() {
  yield call(print, 'Hello world')
  yield call(sleep, 2000)
  yield call(print, 'yea')
}
sagaRunner(test)

// function* test2() {
//   yield sleep(10000)
// }
// sagaRunner(test2)
