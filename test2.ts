enum EffectType {
  RUN,
  JOIN,
  DEFER,
}

type RunEffect = {
  kind: EffectType.RUN,
  saga: Saga,
  args: Array<any>,
}
type JoinEffect = {
  kind: EffectType.JOIN,
  promise: any,
}
type DeferEffect = {
  kind: EffectType.DEFER,
  effect: Effect,
}
type Effect = RunEffect | DeferEffect | JoinEffect;

type EffectsIterator = IterableIterator<Effect>;
type Saga = (...args: Array<any>) => EffectsIterator;

function runSaga(saga: Saga, ...args) {
  const generator = saga(...args);
  return execute(generator, []);
}

function* values(arr) {
  for (let i = 0; i < arr.length; i++) {
    yield arr[i];
  }
}

function execute(
  generator: EffectsIterator, deferred: Array<Effect>, passback = null
) {
  const next = generator.next(passback);
  return recurse(generator, deferred, next);
}

// takes instruction, (taken from generator)
// returns promise of result
function recurse(
  generator: EffectsIterator, deferred: Array<Effect>, instruction
) {
  while (true) {
    // console.log('recurse', generator, deferred, instruction);
    const { value: cmd, done } = instruction;

    if (done) {
      if (deferred.length) {
        deferred.reverse();
        return execute(values(deferred), []).then(() => cmd);
      } else {
        return cmd;
      }
    }

    switch (cmd.kind) {
      case EffectType.RUN:
        const old = generator;
        generator = (function* () {
          const result = yield* cmd.saga(...cmd.args);
          return yield join(execute(old, deferred, result));
        })();
        instruction = generator.next();
        break;
      case EffectType.JOIN:
        if (cmd.promise instanceof Promise) {
          return new Promise((resolve) => {
            resolve(
              cmd.promise.then(result => {
                return execute(generator, deferred, result);
              }).catch(err => {
                const next = (generator as any).throw(err);
                return recurse(generator, deferred, next);
              })
            );
          });
        }
        instruction = generator.next(cmd.promise);
        break;
      case EffectType.DEFER:
        deferred.push(cmd.effect);
        instruction = generator.next();
        break;
      default:
        // NOTE: should this be generator.throw??
        throw new Error('Yielded a non-effect');
    }
  }
}

// effects

function run(saga, ...args) {
  return {
    kind: EffectType.RUN,
    saga,
    args,
  };
}

function runWait(saga, ...args) {
  return run(function *() {
    return yield join(runSaga(saga, ...args));
  });
}

function join(promise) {
  return {
    kind: EffectType.JOIN,
    promise,
  };
}

function defer(effect) {
  return {
    kind: EffectType.DEFER,
    effect,
  };
}

function fork(effect) {
  return run(function* () {
    const done = runSaga(function *() { yield effect; });
    yield defer(join(done));
    return done;
  });
}

function call(fn, ...args) {
  return run(function* () {
    return yield join(fn(...args));
  });
}

function timeout(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export {
  defer, join, run, runWait, call, runSaga, fork,
};

// example

// tslint:disable no-console no-unused-variable

function* go1() {
  const result = yield runWait(function* () {
    yield fork(call(timeout, 2000));
    yield call(timeout, 500);
    console.log('finishing');

    return 'hello';
  });

  console.log('done waiting', result);
}

function* go2() {
  const result = yield runWait(function* () {
    yield fork(run(function*(arg) {
      yield call(timeout, 500);
      console.log('first timeout done', arg);
      yield fork(run(function*(arg2) {
        yield call(timeout, 500);
        console.log('second timeout done', arg, arg2);
      }, 2));
    }, 1));
    yield call(timeout, 500);
    console.log('finished outer timeout');

    return 'hello';
  });

  console.log('done waiting', result);
}

function* go3() {
  const result = yield run(function* () {
    yield run(function*(arg) {
      yield call(function(x) { return x + ' ok'; }, 'ook')
      console.log('first run', arg);
    }, 1);
    console.log('after run');
    yield run(function*(arg) {
      yield call(function(x) { return x + ' ok'; }, 'ook')
      console.log('second run', arg);
    }, 1);

    return 'hello';
  });

  console.log('done waiting', result);
}

function* go(): IterableIterator<any> {
  yield defer(fork(run(go1)))
  yield fork(run(go2))
  yield fork(run(go3))
  console.log('done with all');
}

runSaga(go);
console.log('ran saga');

