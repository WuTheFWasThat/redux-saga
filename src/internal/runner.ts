import { is, check } from './utils'
import proc from './proc'

export default function sagaRunnerFactory(options: any = {}) {
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
