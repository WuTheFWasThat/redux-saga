export type Predicate<T> = (arg: T) => boolean;

export interface Task {
  // TODO FOR INTERNALS:
  cont?: (v?: any, errored?: boolean) => any
  name?: string
  joiners?: Array<any> | null,

  // actual task interface
  done: Promise<any>
  isRunning(): boolean
  isCancelled(): boolean
  result(): any
  result<T>(): T
  error(): any
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
  [others: string]: any // TODO due to way internals does weird stuff
}
