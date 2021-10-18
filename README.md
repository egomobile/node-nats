[![npm](https://img.shields.io/npm/v/@egomobile/nats.svg)](https://www.npmjs.com/package/@egomobile/nats)
[![last build](https://img.shields.io/github/workflow/status/egomobile/node-nats/Publish)](https://github.com/egomobile/node-nats/actions?query=workflow%3APublish)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg?style=flat-square)](https://github.com/egomobile/node-nats/pulls)

# @egomobile/nats

> Classes, functions and tools that help to connect and communicate to and with a NATS streaming server, written in [TypeScript](https://www.typescriptlang.org/).

## Install

Execute the following command from your project folder, where your `package.json` file is stored:

```bash
npm install --save @egomobile/nats
```

## Usage

```typescript
import { loadNatsListeners, stan } from "@egomobile/nats";

// 'stan' configuration is setup
// in following environment variables
//
// POD_NAME => client ID
// NATS_CLUSTER_ID => cluster ID
// NATS_URL => (optional) URL to NATS server ... Default 'http://nats:4222'

let subscriptions: any[] | undefined;

async function main() {
  // scan all .ts files in 'listeners' sub folder
  // and execute all exported functions, which are
  // exported by 'default' or directly as CommonJS
  // function
  //
  // s. below
  subscriptions = loadNatsListeners({
    dir: __dirname + "/listener",
    filter: ".ts",
  });

  // connect to server
  await stan.connect();

  // close connection, when process exits
  // --or-- exit process, when connection collapses
  //
  // this is very useful in Kubernetes PODs
  stan.exitOnClose();
}

main().error(console.error);
```

A "listener" file, loaded by `loadNatsListeners()` function can look like that:

```typescript
// file: listeners/foo_subject.ts

import {
  ISetupNatsListenerActionArguments,
  NatsListener,
} from "@egomobile/nats";

interface IFooEvent {
  bar: string;
  baz?: number;
}

export default async ({ name, stan }: ISetupNatsListenerActionArguments) => {
  // name === 'foo_subject'
  // use it as subject for the listener

  const listener = new NatsListener<IFooEvent>(name, {
    client: stan,
  });
  listener.onMessage = async ({ message }) => {
    // handle 'message'
  };

  // 'Subscription' instance should
  // be used as object / value that
  // represents the listener (connection)
  return listener.listen();
};
```

This example shows, how to send / publish a `foo_subject` event from another client later, e.g.:

```typescript
import { NatsPublisher } from "@egomobile/nats";

interface IFooEvent {
  bar: string;
  baz?: number;
}

await new NatsPublisher<IFooEvent>("foo_subject").publish({
  bar: "Foo",
  baz: 5979,
});
```

## Documentation

The API documentation can be found [here](https://egomobile.github.io/node-nats/).
