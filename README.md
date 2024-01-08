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
import {
  NatsClient,
  NatsMessageError
} from "@egomobile/nats"

interface IFooMessage {
  bar: number;
}

// creates and opens an instance to a NATS
// server using `NATS_URL`, `NATS_USER` and `NATS_PASSWORD`
// environment variables by default
const client = NatsClient.open({
  "name": process.env.POD_NAME!.trim()
})

// optional:
// https://developer.mozilla.org/en-US/docs/Web/API/AbortController
const ac = new AbortController()

const consumer = client.createConsumer<IFooMessage>()
consumer.on("error", (error) => {
  if (error instanceof NatsMessageError) {
    // is happends if handling a message failed
    //
    // error.msg contains `JsMsg`
    // error.cause contains inner exception
    console.error('Consumer message error:', error)
  } else {
    console.error('Consumer error:', error)
  }
})

const disposeSubscription = consumer.subscribe({
  signal: ac.signal
})

const publisher = client.createPublisher<IFooMessage>()
await publisher.publish({
  "bar": 42
})

setTimeout(() => {
  ac.abort()

  // alternative, if there is no AbortController:
  //
  // disposeSubscription()
}, 10000)
```

## Documentation

The API documentation can be found [here](https://egomobile.github.io/node-nats/).
