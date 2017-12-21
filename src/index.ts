import { IDatabase, IConnected, ILostContext } from 'pg-promise';

export interface Options {
  /**
   * The existing pg-promise connection to use for creating the new direct connection
   */
  db: IDatabase<any>;

  /**
   * Called when a connection is established, either when connecting initially
   * or when a connection was restored after being lost
   *
   * @param connection The direct connection object
   */
  onConnect: (connection: IConnected<any>) => void;

  /**
   * Called when a connection that was previously established has been lost.
   *
   * @param err The error that details how/why the connection was lost
   * @param context The pg-promise context object containing `client` and other
   * properties that may be useful to gracefully handle a disconnection event in
   * your application.
   *
   * @return May optionally return a Promise; if a Promise is returned, the retry
   * attempts will not begin until the Promise is resolved. If the Promise is
   * rejected, no further retry attempts will be made, and `onFailure` will be
   * called.
   */
  onDisconnect: (err: Error, context: ILostContext) => Promise<any> | void;

  /**
   * Called when a retry attempt has been scheduled.
   *
   * @param interval The number of milliseconds before the retry will be attempted
   * @param attemptsRemaining The number of attempts remaining before the
   * disconnection is considered 'permanent'
   */
  onRetryScheduled?: (interval: number, attemptsRemaining: number) => void;

  /**
   * Called when a retry was attempted and it failed.
   *
   * @param err The Error detailing how/why the retry attempt failed
   * @param attemptsRemaining The number of attempts remaining before the
   * disconnection is considered 'permanent'
   */
  onRetryFailure?: (err: Error, attemptsRemaining: number) => void;

  /**
   * Called when maximum number of retry attempts have been met.
   *
   * @default `process.exit()`
   * @param err The Error detailing how/why the permanent failure occurred
   */
  onFailure?: (err: Error) => void;

  /**
   * The number of milliseconds to wait before retrying
   *
   * @default 1000
   */
  retryInterval?: number;

  /**
   * The maximum number of milliseconds to wait before failing permanently
   *
   * @default 10
   */
  retryAttempts?: number;
}

const DEFAULT_OPTIONS: Partial<Options> = {
  onFailure: () => process.exit(),
  retryInterval: 1000,
  retryAttempts: 10
};

/**
 * Initiates a 'robust' direct connection using pg-promise. Inspired by
 * https://github.com/vitaly-t/pg-promise/wiki/Robust-Listeners.
 *
 * @param options The configuration parameters and event handlers for the robust
 * connection
 *
 * @return A Promise that will be settled then the initial connection succeeds
 * or fails.
 */
export const robustConnection = (options: Options) => {
  const {
    db,
    retryInterval,
    retryAttempts,
    onConnect,
    onDisconnect,
    onRetryScheduled,
    onRetryFailure,
    onFailure
  }: Options = {
      ...options,
      ...DEFAULT_OPTIONS
    };

  const onLost = (error: Error, context: ILostContext) => {
    Promise.resolve(onDisconnect(error, context))
      .then(() => connect(retryInterval, retryAttempts))
      .then(onConnect)
      .catch(onFailure);
  };

  const connect = (delay = 0, maxAttempts = 1) =>
    new Promise<IConnected<any>>((resolve, reject) => {
      if (onRetryScheduled) {
        onRetryScheduled(delay, maxAttempts);
      }

      setTimeout(() => {
        db.connect({ direct: true, onLost })
          .then(resolve)
          .catch(error => {
            if (onRetryFailure) {
              onRetryFailure(error, maxAttempts);
            }

            if (maxAttempts < 1) {
              reject(error);
            }

            return connect(delay, maxAttempts - 1)
              .then(resolve)
              .catch(reject);
          });
      }, delay);
    });

  return connect()
    .then(onConnect)
    .catch(onFailure);
};
