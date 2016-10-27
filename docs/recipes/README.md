# Recipes

## Throttling

You can throttle a sequence of dispatched actions by using a handy built-in `throttle` helper. For example, suppose the UI fires an `INPUT_CHANGED` action while the user is typing in a text field.

```javascript
import { throttle } from 'saga'

function* handleInput(input) {
  // ...
}

function* watchInput() {
  yield throttle(500, 'INPUT_CHANGED', handleInput)
}
```

By using this helper the `watchInput` won't start a new `handleInput` task for 500ms, but in the same time it will still be accepting the latest `INPUT_CHANGED` actions into its underlaying `buffer`, so it'll miss all `INPUT_CHANGED` actions happening in-between. This ensures that the Saga will take at most one `INPUT_CHANGED` action during each period of 500ms and still be able to process trailing action.

## Debouncing

To debounce a sequence, put the `delay` in the forked task:

```javascript

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms))

function* handleInput(input) {
  // debounce by 500ms
  yield call(delay, 500)
  ...
}

function* watchInput() {
  let task
  while (true) {
    const { input } = yield take('INPUT_CHANGED')
    if (task) {
      yield cancel(task)
    }
    task = yield fork(handleInput, input)
  }
}
```

In the above example `handleInput` waits for 500ms before performing its logic. If the user types something during this period we'll get more `INPUT_CHANGED` actions. Since `handleInput` will still be blocked in the `delay` call, it'll be cancelled by `watchInput` before it can start performing its logic.

Example above could be rewritten with saga `takeLatest` helper:

```javascript

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms))

function* handleInput({ input }) {
  // debounce by 500ms
  yield call(delay, 500)
  ...
}

function* watchInput() {
  // will cancel current running handleInput task
  yield takeLatest('INPUT_CHANGED', handleInput);
}
```

## Retrying XHR calls

To retry a XHR call for a specific amount of times, use a for loop with a delay:

```javascript

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms))

function* updateApi(data) {
  for(let i = 0; i < 5; i++) {
    try {
      const apiResponse = yield call(apiRequest, { data });
      return apiResponse;
    } catch(err) {
      if(i < 5) {
        yield call(delay, 2000);
      }
    }
  }
  // attempts failed after 5x2secs
  throw new Error('API request failed');
}

export default function* updateResource() {
  while (true) {
    const { data } = yield take('UPDATE_START');
    try {
      const apiResponse = yield call(updateApi, data);
      yield put({
        type: 'UPDATE_SUCCESS',
        payload: apiResponse.body,
      });
    } catch (error) {
      yield put({
        type: 'UPDATE_ERROR',
        error
      });
    }
  }
}

```

In the above example the `apiRequest` will be retried for 5 times, with a delay of 2 seconds in between. After the 5th failure, the exception thrown will get caught by the parent saga, which will dispatch the `UPDATE_ERROR` action.

If you want unlimited retries, then the `for` loop can be replaced with a `while (true)`. Also instead of `take` you can use `takeLatest`, so only the last request will be retried. By adding an `UPDATE_RETRY` action in the error handling, we can inform the user that the update was not successfull but it will be retried.

```javascript
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms))

function* updateApi(data) {
  while (true) {
    try {
      const apiResponse = yield call(apiRequest, { data });
      return apiResponse;
    } catch(error) {
      yield put({
        type: 'UPDATE_RETRY',
        error
      })
      yield call(delay, 2000);
    }
  }
}

function* updateResource({ data }) {
  const apiResponse = yield call(updateApi, data);
  yield put({
    type: 'UPDATE_SUCCESS',
    payload: apiResponse.body,
  });
}

export function* watchUpdateResource() {
  yield takeLatest('UPDATE_START', updateResource);
}

```
