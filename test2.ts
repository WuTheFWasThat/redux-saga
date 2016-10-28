function runSaga(saga, ...args) {
  const generator = saga(...args);
  return execute(generator, []);
}

function* values(arr) {
  for (let i = 0; i < arr.length; i++) {
    yield arr[i];
  }
}

function execute(generator, deferred, inject = null) {
  const next = generator.next(inject);
  return recurse(generator, deferred, next);
}

// takes instruction, (taken from generator)
// returns promise of result
function recurse(generator, deferred, instruction) {
  // console.log('recurse', generator, deferred, instruction);
  const { value: cmd, done } = instruction;

  if (done) {
    if (deferred.length) {
      deferred.reverse();
      return execute(values(deferred), []).then(() => cmd);
    } else {
      return Promise.resolve(cmd);
    }
  }

  switch (cmd.kind) {
    case 'run':
      return execute((function* () {
        const result = yield* cmd.saga();
        return yield join(execute(generator, deferred, result));
      })(), deferred);
    case 'join':
      return cmd.promise.then(result => {
        return execute(generator, deferred, result);
      }).catch(err => {
        const next = generator.throw(err);
        return recurse(generator, deferred, next);
      });
    case 'defer':
      deferred.push(cmd.effect);
      return execute(generator, deferred);
    default:
      // NOTE: should this be generator.throw??
      throw new Error('Yielded a non-effect');
  }
}

// effects

function run(saga) {
  return {
    kind: 'run',
    saga,
  };
}

function call(saga, ...args) {
  return run(function *() {
    return yield join(runSaga(saga, ...args));
  });
}

function join(promise) {
  return {
    kind: 'join',
    promise,
  };
}

function defer(effect) {
  return {
    kind: 'defer',
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

function timeout(ms) {
  return run(function* () {
    return yield join(new Promise(resolve => setTimeout(resolve, ms)));
  });
}

export {
  defer, call, join, run, runSaga, fork, timeout,
};

// example

function* go() {
  const result = yield call(function* () {
    yield fork(timeout(2000));
    yield timeout(500);
    console.log('finishing');

    return 'hello';
  });

  console.log('done waiting', result);
}

function* go2() {
  const result = yield call(function* () {
    yield fork(run(function*() {
      yield timeout(500);
      console.log('first timeout done');
      yield fork(run(function*() {
        yield timeout(500);
        console.log('second timeout done');
      }));
    }));
    yield timeout(500);
    console.log('finished outer timeout');

    return 'hello';
  });

  console.log('done waiting', result);
}

runSaga(go2);

