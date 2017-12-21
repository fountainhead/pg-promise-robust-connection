# Robust Direct Connections for pg-promise

This is a helper function to assist in creating a 'robust' direct connection to a Postgresql database when using the excellent [pg-promise](https://github.com/vitaly-t/pg-promise) library. The implementation is strongly inspired by https://github.com/vitaly-t/pg-promise/wiki/Robust-Listeners, with some additional configuration and logging hooks added.

As is strongly stated and re-stated in the pg-promise documentation, you probably *don't need* a direct connection for the majority of use-cases, and should stick to pg-promises own connection management and retry logic. However, if you're using `LISTEN` and `NOTIFY`, then some manual retry management is essential- if a network partition or other outage breaks connectivity between your application and the database, you will miss out LISTEN events that occur, even after the outage is over.

## Basic Usage

```typescript

// your-app.ts
import {robustConnection} from 'pg-promise-robust-connection';

const myDb = pgPromise()({/** your connection options **/});

// Your app code, using connection pooling against myDB

robustConnection({
  // The pg-promise connection to spawn the direct connection from
  db: myDB

  // Connect established for the first time or after being disconnected previously
  onConnect: (connection) => {
    console.log('connected!');
    connection.client.on('notification', messageHandler);
    connection.none('LISTEN somechannel');
  },

  // Connection was lost; will attempt to reconnect, but clean up in the meantime
  onDisconnect: (err, context) => {
    console.log('disconnected');
    context.client.removeListener('notification', messageHandler);
  }
});

// Allow a reference to messageHandler to be kept so that we may clean it up on disconnect
const messageHandler = (message) => {
  console.log('Got a message', message)
}
```

By default, when a connection is lost, it will be retried every 1 second a maximum of 10 times. If the last attempt fails, the connection will be considered to have 'failed permanently'. In this case, `process.exit()` will be called. Then, it's up to your higher level process handler to try to restart the service. Better to have your Dashboard reporting a dead app than one that is half-functional.

## Advanced Usage

Please refer to the documentation of the `Options` interface for details about the other options that are available.
