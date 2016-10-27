import { is, check } from './utils'
import proc from './proc'
import {emitter} from './channel'

export default function sagaRunnerFactory(options = {}) {
  let runSagaDynamically

  if(is.func(options)) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('Saga Runner no longer accept Generator functions. Use sagaRunner.run instead');
    } else {
      throw new Error(`You passed a function to the Saga Runner. You are likely trying to start a\
        Saga by directly passing it to the Runner. This is no longer possible starting from 0.10.0.\
        To run a Saga, you must do it dynamically AFTER mounting the Runner into the store.
        Example:
          import createSagaRunner from 'redux-saga'
          ... other imports

          const sagaRunner = createSagaRunner()
          const store = createStore(reducer, applyRunner(sagaRunner))
          sagaRunner.run(saga, ...args)
      `)
    }

  }

  if(options.logger && !is.func(options.logger)) {
    throw new Error('`options.logger` passed to the Saga Runner is not a function!')
  }

  if(options.onerror && !is.func(options.onerror)) {
    throw new Error('`options.onerror` passed to the Saga Runner is not a function!')
  }

  function sagaRunner(/* { dispatch, getState } */) {
    runSagaDynamically = runSaga
    const sagaEmitter = emitter()

    function runSaga(saga, ...args) {
      return proc(
        saga(...args),
        sagaEmitter.subscribe,
        options,
        0,
        saga.name
      )
    }

    return next => action => {
      const result = next(action) // hit reducers
      sagaEmitter.emit(action)
      return result
    }
  }

  sagaRunner.run = (saga, ...args) => {
    check(saga, is.func, 'sagaRunner.run(saga, ...args): saga argument must be a Generator function!')
    return runSagaDynamically(saga, ...args)
  }

  return sagaRunner
}
