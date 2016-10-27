export type Predicate<T> = (arg: T) => boolean;

export interface Task {
  isRunning(): boolean
  isCancelled(): boolean
  result(): any
  result<T>(): T
  error(): any
  done: Promise<any> // tslint:disable-line member-ordering
  cancel(): void
}

export interface Buffer<T> {
  isEmpty(): boolean
  put(message: T): void
  take(): T
  flush(): void
}

export interface Channel<T> {
  take(cb: (message: T) => void, matcher?: Predicate<T>): void
  put(message: T): void
  close(): void
  [others: string]: any
}
