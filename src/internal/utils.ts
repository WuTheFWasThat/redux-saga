import { Predicate } from './types'

export const sym = id => `@@saga/${id}`
export const TASK  = sym('TASK')
export const HELPER  = sym('HELPER')
export const MATCH = sym('MATCH')
export const CANCEL = sym('cancelPromise')
export const konst = v => () => v
export const kTrue = konst(true)
export const kFalse = konst(false)
export const noop = (): void => {} // tslint:disable-line no-empty
export const ident = v => v

export function check(value, predicate, error) {
  if (!predicate(value)) {
    log('error', 'uncaught at check', error)
    throw new Error(error)
  }
}

type isType = {
  undef: Predicate<any>
  notUndef: Predicate<any>
  func: Predicate<any>
  number: Predicate<any>
  array: Predicate<any>
  promise: Predicate<any>
  iterator: Predicate<any>
  task: Predicate<any>
  observable: Predicate<any>
  buffer: Predicate<any>
  channel: Predicate<any>
  helper: Predicate<any>
  pattern: Predicate<any>
}
export const is: isType = {
  undef     : v => v === null || v === undefined,
  notUndef  : v => v !== null && v !== undefined,
  func      : f => typeof f === 'function',
  number    : n => typeof n === 'number',
  array     : Array.isArray,
  promise   : p => p && is.func(p.then),
  iterator  : it => it && is.func(it.next) && is.func(it.throw),
  task      : t => t && t[TASK],
  observable: ob => ob && is.func(ob.subscribe),
  buffer    : buf => buf && is.func(buf.isEmpty) && is.func(buf.take) && is.func(buf.put),
  pattern   : pat => pat && ((typeof pat === 'string') || (typeof pat === 'symbol') || is.func(pat) || is.array(pat)),
  channel   : ch => ch && is.func(ch.take) && is.func(ch.close),
  helper    : it => it && it[HELPER],
}

export function remove(array, item) {
  const index = array.indexOf(item)
  if (index >= 0) {
    array.splice(index, 1)
  }
}

interface Deferred<R> {
  resolve(result: R): void;
  reject(error: any): void;
  promise: Promise<R>; // tslint:disable-line member-ordering
}
export function deferred(): Deferred<any> {
  let def_resolve;
  let def_reject;
  const promise = new Promise((resolve, reject) => {
    def_resolve = resolve
    def_reject = reject
  })
  return {
    promise,
    resolve: def_resolve,
    reject: def_reject,
  }
}

export function arrayOfDeffered<T>(length: number): Deferred<T>[] {
  const arr: Deferred<T>[] = []
  for (let i = 0; i < length; i++) {
    arr.push(deferred())
  }
  return arr
}

export function autoInc(seed = 0) {
  return () => ++seed
}

const kThrow = err => { throw err }
const kReturn = value => ({value, done: true})
export function makeIterator(next, thro = kThrow, name = '', isHelper = false) {
  const iterator = {name, next, throw: thro, return: kReturn}

  if (isHelper) {
    iterator[HELPER] = true
  }
  if (typeof Symbol !== 'undefined') {
    iterator[Symbol.iterator] = () => iterator
  }
  return iterator
}

/*
 * Print error in a useful way whether in a browser environment
 * (with expandable error stack traces), or in a node.js environment
 * (text-only log output)
 */
export function log(level, message, error) {
  /*eslint-disable no-console*/
  if (typeof window === 'undefined') {
    console.log(`saga ${level}: ${message}\n${(error && error.stack) || error}`) // tslint:disable-line no-console
  } else {
    console[level](message, error)
  }
}

export const internalErr = err => new Error(`
  redux-saga: Error checking hooks detected an inconsistent state. This is likely a bug
  in redux-saga code and not yours. Thanks for reporting this in the project's github repo.
  Error: ${err}
`)
