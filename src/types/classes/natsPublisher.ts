// This file is part of the @egomobile/nats distribution.
// Copyright (c) Next.e.GO Mobile SE, Aachen, Germany (https://e-go-mobile.com/)
//
// @egomobile/nats is free software: you can redistribute it and/or modify
// it under the terms of the GNU Lesser General Public License as
// published by the Free Software Foundation, version 3.
//
// @egomobile/nats is distributed in the hope that it will be useful, but
// WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
// Lesser General Public License for more details.
//
// You should have received a copy of the GNU Lesser General Public License
// along with this program. If not, see <http://www.gnu.org/licenses/>.

import { JSONCodec } from "nats";
import type { NatsClient } from "./natsClient";
import { EventEmitter } from "node:events";

/**
 * Options for `NatsPublisher<T>` class.
 */
export interface INatsPublisherOptions {
    /**
     * The underlying client.
     */
    client: NatsClient;
    /**
     * The name of the underlying stream.
     */
    streamName: string;
}

/**
 * A NATS publisher.
 */
export class NatsPublisher<T> extends EventEmitter {
    /**
     * Initializes a new instance of that class.
     *
     * @param {INatsPublisherOptions} options The options.
     */
    constructor(public readonly options: INatsPublisherOptions) {
        super();
    }

    /**
     * Gets the underlying client.
     *
     * @returns {NatsClient} The underlying client.
     */
    get client(): NatsClient {
        return this.options.client;
    }

    /**
     * Gets if publisher is in mock mode or not.
     *
     * @returns {boolean} Is in mock mode or not.
     */
    get isMock(): boolean {
        return !!this.options.client.isMock;
    }

    /**
     * Publishes a message.
     *
     * @example
     * ```
     * import { NatsClient } from "@egomobile/nats"
     *
     * interface IFooMessage {
     *   bar: number;
     * }
     *
     * // creates and opens an instance to a NATS
     * // server using `NATS_URL`, `NATS_USER` and `NATS_PASSWORD`
     * // environment variables
     * const client = NatsClient.open({
     *   "name": process.env.POD_NAME!.trim()
     * })
     *
     * const consumer = client.createConsumer<IFooMessage>()
     * consumer.subscribe()
     *
     * const publisher = client.createPublisher<IFooMessage>()
     * await publisher.publish({
     *   "bar": 42
     * })
     * ```
     *
     * @param {T} message The message to publish.
     *
     * @returns {Promise<boolean>} A promise that indicates if operation was successful or not.
     */
    async publish(message: T): Promise<boolean> {
        if (this.isMock) {
            return true;
        }

        try {
            const nc = this.client.connection;
            if (!nc) {
                throw new Error("no NATS connection available");
            }

            const jc = JSONCodec();

            const js = nc.jetstream();

            await js.publish(this.streamName, jc.encode(message));

            return true;
        }
        catch (error) {
            this.emit("error", error);
        }

        return false;
    }

    /**
     * The name of the underlying stream.
     *
     * @returns {string} The name of the stream.
     */
    get streamName(): string {
        return this.options.streamName;
    }
}
