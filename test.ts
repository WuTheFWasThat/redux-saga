import sagaRunnerFactory from 'src';
import { call } from 'src/effects';

const sagaRunner = sagaRunnerFactory();

function* test() {
  yield call(console.log, 'Hello world');
}
sagaRunner.run(test)
