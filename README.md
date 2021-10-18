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
import { stan } from "@egomobile/nats";

// 'stan' configuration is setup
// in following environment variables
//
// POD_NAME => client ID
// NATS_CLUSTER_ID => cluster ID
// NATS_URL => (optional) URL to NATS server ... Default 'http://nats:4222'

async function main() {
  // connect to server
  await stan.connect();

  // close connection, when
  // process exists
  stan.exitOnClose();
}

main().error(console.error);
```

## Documentation

The API documentation can be found [here](https://egomobile.github.io/node-nats/).
