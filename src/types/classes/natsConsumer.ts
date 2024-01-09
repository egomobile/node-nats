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

import { JSONCodec, JsMsg } from "nats";
import { EventEmitter } from "node:events";
import type { NatsClient } from "./natsClient";
import type { Dispose, Nilable } from "../internal";
import { NatsMessageError } from "./natsMessageError";
import { asAsync } from "../../utils/internal";

/**
 * Options for `NatsConsumer<T>` class.
 */
export interface INatsConsumerOptions {
    /**
     * A custom `AbortController`.
     */
    abortController?: Nilable<AbortController>;
    /**
     * The underlying client.
     */
    client: NatsClient;
    /**
     * Should not do an automatic ACK in every message.
     */
    noAutoAck?: Nilable<boolean>;
    /**
     * The name of the underlying stream.
     */
    streamName: string;
}

/**
 * A message consumer context.
 */
export interface INatsMessageConsumerContext<T> {
    /**
     * The function to call to ack a message.
     */
    ack: () => void;
    /**
     * Do not ack a message automatically.
     */
    noAck: boolean;
    /**
     * The received message.
     */
    message: T;
}

/**
 * Options for `NatsConsumer<T>.subscribe()` method.
 */
export interface ISubscribeNatsConsumerOptions {
    signal?: Nilable<AbortSignal>;
}

function createAck(message: JsMsg) {
    return () => {
        message.ack();
    };
}

function createMessageCallback<T>(func: (...args: any[]) => any): (context: INatsMessageConsumerContext<T>) => Promise<any> {
    func = asAsync(func);

    return async (context: INatsMessageConsumerContext<any>) => {
        const result = await func(context);

        if (!context.noAck) {
            context.ack();
        }

        return result;
    };
}

/**
 * A NATS consumer.
 */
export class NatsConsumer<T> extends EventEmitter {
    readonly #abortController: AbortController;

    /**
     * Initializes a new instance of that class.
     *
     * @param {INatsPublisherOptions} options The options.
     */
    constructor(public readonly options: INatsConsumerOptions) {
        super();

        this.#abortController = options.abortController ?? new AbortController();
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
     * Gets if there should be no auto ACK.
     *
     * @returns {boolean} Value indicating that there is no auto ACK.
     */
    get noAutoAck(): boolean {
        return !!this.options.noAutoAck;
    }

    /**
     * @inheritdoc
     */
    on(eventName: "error", func: (error: any) => any): this;
    on(eventName: "message", func: (context: INatsMessageConsumerContext<T>) => any): this;
    on(eventName: string | symbol, func: (...args: any[]) => any): this {
        let funcToUse = func;

        if (eventName === "message") {
            // wrap it to an async function with
            // automatic call of ack(), if defined
            funcToUse = createMessageCallback<T>(func);
        }

        return super.on(eventName, funcToUse);
    }

    /**
     * @inheritdoc
     */
    once(eventName: "error", func: (error: any) => any): this;
    once(eventName: "message", func: (context: INatsMessageConsumerContext<T>) => any): this;
    once(eventName: string | symbol, func: (...args: any[]) => any): this {
        let funcToUse = func;

        if (eventName === "message") {
            // wrap it to an async function with
            // automatic call of ack(), if defined
            funcToUse = createMessageCallback<T>(func);
        }

        return super.once(eventName, funcToUse);
    }

    /**
     * Gets if consumer is in mock mode or not.
     *
     * @returns {boolean} Is in mock mode or not.
     */
    get isMock(): boolean {
        return !!this.options.client.isMock;
    }

    /**
     * The name of the underlying stream.
     *
     * @returns {string} The name of the stream.
     */
    get streamName(): string {
        return this.options.streamName;
    }

    /**
     * Subscribes for listening.
     *
     * @param {Nilable<ISubscribeNatsConsumerOptions>} [options] Custom options.
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
     * // make it lter possible to abort
     * const ac = new AbortController()
     *
     * const consumer = client.createConsumer<IFooMessage>({ "streamName": "foo-stream" })
     * const disposeSubscription = consumer.subscribe({ signal: ac.signal })
     *
     * const publisher = client.createPublisher<IFooMessage>({ "streamName": "foo-stream" })
     * await publisher.publish({
     *   "bar": 42
     * })
     *
     * setTimeout(() => {
     *   ac.abort()
     *
     *   // alternative, if no AbortController is submitted:
     *   //
     *   // disposeSubscription()
     * }, 10000)
     * ```
     *
     * @returns {Dispose} A function that can be called to dispose / stop the subscription.
     */
    subscribe(options?: Nilable<ISubscribeNatsConsumerOptions>): Dispose {
        if (this.isMock) {
            return () => {
            };
        }

        const innerAbortController = new AbortController();

        const signal = options?.signal;

        // do this in the background
        (async () => {
            const nc = this.client.connection;
            if (!nc) {
                throw new Error("no NATS connection available");
            }

            const jc = JSONCodec();

            const js = nc.jetstream();

            const consumer = await js.consumers.get(this.streamName, this.client.name);

            const messages = await consumer.consume();

            for await (const message of messages) {
                const isAborted = innerAbortController.signal.aborted ||
                    this.#abortController.signal.aborted ||
                    !!signal?.aborted;
                if (isAborted) {
                    break;
                }

                try {
                    const context: INatsMessageConsumerContext<T> = {
                        "ack": createAck(message),
                        "noAck": this.noAutoAck,
                        "message": jc.decode(message.data) as T
                    };

                    this.emit("message", context);
                }
                catch (error) {
                    this.emit("error", new NatsMessageError(error, message));
                }
            }
        })().catch((error) => {
            this.emit("error", error);
        });

        return () => {
            innerAbortController.abort();
        };
    }
}
