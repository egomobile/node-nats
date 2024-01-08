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

import { ConnectionOptions, connect as connectToNats, NatsConnection } from "nats";
import type { GetterOrValue, Nilable } from "../internal";
import { EventEmitter } from "node:events";
import { INatsPublisherOptions, NatsPublisher } from "./natsPublisher";
import { INatsConsumerOptions, NatsConsumer } from "./natsConsumer";

/**
 * Options for `NatsClient.exitOnClode()` method.
 */
export interface IExitOnCloseNatsOptions {
    /**
     * The custom exit code.
     *
     * @default `2`.
     */
    exitCode?: Nilable<string>;
}

/**
 * Options for `NatsClient` class.
 */
export interface INatsClientOptions {
    /**
     * A custom `AbortController`.
     */
    abortController?: Nilable<AbortController>;
    /**
     * Custom connection options or the function that receives it.
     */
    connectionOptions?: Nilable<GetterOrValue<ConnectionOptions>>;
    /**
     * Is in mock mode or not.
     */
    isMock?: Nilable<boolean>;
    /**
     * Name of the connection.
     */
    name: string;
}

/**
 * A NATS client.
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
 */
export class NatsClient extends EventEmitter {
    readonly #abortController: AbortController;
    #connection: Nilable<NatsConnection>;
    readonly #getConnectionOptions: () => Promise<ConnectionOptions>;

    /**
     * Initializes a new instance of that class.
     *
     * @param {Nilable<INatsClientOptions>} [options] Custom options.
     */
    constructor(public readonly options: INatsClientOptions) {
        super();

        if (options?.connectionOptions) {
            if (typeof options.connectionOptions === "function") {
                const getConnectionOptions = options.connectionOptions;

                this.#getConnectionOptions = async () => {
                    return Promise.resolve(getConnectionOptions());
                };
            }
            else if (typeof options.connectionOptions === "object") {
                const connectionOptions = options.connectionOptions;

                this.#getConnectionOptions = async () => {
                    return connectionOptions;
                };
            }
            else {
                throw new TypeError("options.connectionOptions needs to be of type object or function");
            }
        }
        else {
            // default

            this.#getConnectionOptions = async () => {
                return {
                    "servers": process.env.NATS_URL?.split("\n"),
                    "user": process.env.NATS_USER?.trim(),
                    "pass": process.env.NATS_PASSWORD?.trim()
                };
            };
        }

        this.#abortController = options?.abortController ?? new AbortController();
    }

    /**
     * Closes the connection.
     *
     * @returns {Promise<boolean>} The promise that indicates if operation was successful or not.
     */
    async close(): Promise<boolean> {
        const currentConnection = this.#connection;
        if (currentConnection && !currentConnection.isClosed()) {
            await currentConnection!.close();

            this.#connection = null;
            return true;
        }

        return false;
    }

    /**
     * Connects to a NATS instance.
     *
     * @returns {Promise<NatsConnection>} The promise with the new connection.
     */
    async connect(): Promise<NatsConnection> {
        if (this.isEnabled) {
            throw new Error("there is already an open connection");
        }

        const newConnection = await connectToNats(
            await this.#getConnectionOptions()
        );

        this.#connection = newConnection;

        return newConnection;
    }

    /**
     * Gets the underlying `NatsConnection`, if open.
     *
     * @returns {Nilable<NatsConnection>} The connection instance, if available.
     */
    get connection(): Nilable<NatsConnection> {
        return this.#connection;
    }

    /**
     * Creates a new consumer instance based on this client.
     *
     * @param {Omit<INatsConsumerOptions,"client">} options The options.
     *
     * @returns {NatsConsumer<T>} The consumer.
     */
    createConsumer<T>(options: Omit<INatsConsumerOptions, "client">): NatsConsumer<T> {
        return new NatsConsumer({
            ...options,

            "client": this,
            "abortController": options.abortController ?? this.#abortController
        });
    }

    /**
     * Creates a new publisher instance based on this client.
     *
     * @param {Omit<INatsPublisherOptions,"client">} options The options.
     *
     * @returns {NatsPublisher<T>} The publisher.
     */
    createPublisher<T>(options: Omit<INatsPublisherOptions, "client">): NatsPublisher<T> {
        return new NatsPublisher({
            ...options,

            "client": this
        });
    }

    /**
     * Registers system wide events to close process
     * and/or `NatsConnection`.
     *
     * @param {Nilable<IExitOnCloseNatsOptions>} options The options.
     *
     * @returns {this} This instance.
     */
    exitOnClose(options?: Nilable<IExitOnCloseNatsOptions>): this {
        const exitCode = options?.exitCode ?? 2;
        if (typeof exitCode !== "number") {
            throw new TypeError("options.exitCode must be of a number");
        }

        // close process, if connection to NATS
        // is terminated
        this.connection!.closed().then(() => {
            process.exit(exitCode);
        });

        // try to close connection, if process closes
        process.once("exit", () => {
            return this.#tryClose();
        });
        process.once("SIGINT", () => {
            return this.#tryClose();
        });
        process.once("SIGUSR1", () => {
            return this.#tryClose();
        });
        process.once("SIGUSR2", () => {
            return this.#tryClose();
        });
        process.once("uncaughtException", (error) => {
            process.exitCode = exitCode;
            console.error("[ERROR]", "@egomobile/nats", error);

            this.#tryClose();
        });

        return this;
    }

    /**
     * Gets if the connection is enabled / open or not.
     *
     * @returns {boolean} Connection is open or not.
     */
    get isEnabled(): boolean {
        return !!this.#connection && !this.#connection.isClosed();
    }

    /**
     * Gets if client is in mock mode or not.
     *
     * @returns {boolean} Is in mock mode or not.
     */
    get isMock(): boolean {
        return !!this.options.isMock;
    }

    /**
     * Creates a new `NatsClient` instance and opens a connection.
     *
     * @param {INatsClientOptions} options The options.
     *
     * @returns {Promise<NatsClient>} The promise with the new client instance.
     */
    static async open(options: INatsClientOptions): Promise<NatsClient> {
        const newClient = new this(options);
        await newClient.connect();

        return newClient;
    }

    /**
     * Shorthand for `options.name`.
     *
     * @returns {string} The client name.
     */
    get name(): string {
        return this.options.name;
    }

    async #tryClose() {
        this.#abortController.abort();

        try {
            await this.connection?.close();
        }
        catch (error) {
            console.warn("[WARN]", "@egomobile/nats", error);
        }
    }
}
