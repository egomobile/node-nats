/* eslint-disable unicorn/filename-case */
/* eslint-disable no-underscore-dangle */

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

import nats, { Stan } from 'node-nats-streaming';
import { Nilable } from '../types';

/**
 * A function, that returns the options for opening a connection to a
 * NATS streaming server.
 */
export type GetNatsClientOptions = () => INatsClientOptions;

/**
 * Options for a NatsClient instance.
 */
export interface INatsClientOptions {
    /**
     * The unique ID of the client.
     */
    clientId: string;
    /**
     * The ID of the cluster.
     */
    clusterId: string;
    /**
     * The URL to the NATS server.
     */
    serverURL: string;
    /**
     * The user to the NATS server.
     */
    user?: Nilable<string> | undefined;
    /**
     * The password to the NATS server.
     */
    password?: Nilable<string> | undefined;
}

/**
 * A default function, that provides options for a NATS streaming client,
 * which runs in a Kubernetes POD e.g.
 *
 * The function required the following environment variables to be set:
 *
 * - NATS_CLUSTER_ID => clusterId
 * - POD_NAME => clientId
 *
 * The following env vars are optional:
 *
 * - NATS_URL => serverURL (default: http://nats:4222)
 *
 * @returns {INatsClientOptions} The options.
 */
export const defaultGetNatsClientOptions: GetNatsClientOptions = () => {
    const NATS_CLUSTER_ID = process.env.NATS_CLUSTER_ID!.trim();
    const NATS_URL = process.env.NATS_URL?.trim();
    const POD_NAME = process.env.POD_NAME!.trim();
    const NATS_USER = process.env.NATS_USER?.trim();
    const NATS_PASSWORD = process.env.NATS_PASSWORD?.trim();

    return {
        clientId: POD_NAME,
        clusterId: NATS_CLUSTER_ID,
        serverURL: NATS_URL?.length ? NATS_URL : 'http://nats:4222',
        user: NATS_USER?.length ? NATS_USER : undefined,
        password: NATS_PASSWORD?.length ? NATS_PASSWORD : undefined
    };
};

/**
 * A simple NATS client.
 *
 * @example
 * ```
 * import { stan } from '@egomobile/nats'
 *
 * // connect to server
 * await stan.connect()
 *
 * // close connection, when process exits
 * // --or-- exit process, when connection collapses
 * //
 * // this is very useful in Kubernetes PODs
 * stan.exitOnClose()
 * ```
 */
export class NatsClient {
    private _client: Nilable<Stan>;

    /**
     * Initializes a new instance of that class.
     *
     * @param {GetNatsClientOptions | INatsClientOptions} optionsOrFunction The function, that returns the options for a connection to a server
     *                                                                      or the options itself.
     */
    public constructor(
        public readonly optionsOrFunction: GetNatsClientOptions | INatsClientOptions
    ) {
        if (typeof optionsOrFunction === 'function') {
            this.getOptions = optionsOrFunction.bind(this);
        } else {
            this.getOptions = () => optionsOrFunction;
        }

        if (typeof this.getOptions !== 'function') {
            throw new TypeError('optionsOrFunction must be an object or function');
        }
    }

    /**
     * Gets the underlying basic client.
     *
     * @returns {Stan} The NATS client.
     */
    public get client(): Stan {
        if (!this._client) {
            throw new Error('Client not connected');
        }

        return this._client;
    }

    /**
     * Closes the connection to server.
     *
     * @returns {boolean} Connection has been closed or not.
     */
    public close(): boolean {
        if (this._client) {
            this._client.close();
            this._client = null;

            return true;
        }

        return false;
    }

    /**
     * Starts a new connection to a NATS server.
     *
     * @example
     * ```
     * import { stan } from '@egomobile/nats'
     *
     * // connect to server
     * await stan.connect()
     * ```
     *
     * @returns {Promise<Stan>} The promise with the base client.
     */
    public connect(): Promise<Stan> {
        return new Promise<Stan>(async (resolve, reject) => {
            try {
                const { clientId, clusterId, serverURL, user, password } = this.getOptions();

                if (!clientId?.length) {
                    throw new Error('No clientId defined');
                }

                if (!clusterId?.length) {
                    throw new Error('No clusterId defined');
                }

                if (!serverURL?.length) {
                    throw new Error('No serverURL defined');
                }

                const opts: nats.StanOptions = {
                    url: serverURL,
                    user: user ? user : undefined,
                    pass: password ? password : undefined
                };

                const newClient = nats.connect(clusterId, clientId, opts);

                newClient.once('error', (err) => {
                    reject(err);
                });

                newClient.once('connect', () => {
                    this._client = newClient;

                    resolve(newClient);
                });
            } catch (e) {
                reject(e);
            }
        });
    }

    /**
     * Registers the process events to close the client on exit.
     *
     * @param {number} exitCode The custom exit code.
     *
     * @returns {this} This instance.
     *
     * @example
     * ```
     * import { stan } from '@egomobile/nats'
     *
     * // connect to server
     * await stan.connect()
     *
     * // close connection, when process exits
     * // --or-- exit process, when connection collapses
     * //
     * // this is very useful in Kubernetes PODs
     * stan.exitOnClose()
     * ```
     */
    public exitOnClose(exitCode = 2): this {
        if (typeof exitCode !== 'number') {
            throw new TypeError('exitCode must be of a number');
        }

        // close process, if connection to NATS
        // is terminated
        this.client.once('close', () => process.exit());

        // try to close connection, if process closes
        process.once('exit', () => this.tryClose());
        process.once('SIGINT', () => this.tryClose());
        process.once('SIGUSR1', () => this.tryClose());
        process.once('SIGUSR2', () => this.tryClose());
        process.once('uncaughtException', (error) => {
            process.exitCode = exitCode;
            console.error('[ERROR]', '@egomobile/nats', error);

            this.tryClose();
        });

        return this;
    }

    /**
     * The function, that returns the options.
     */
    public readonly getOptions: GetNatsClientOptions;

    private tryClose() {
        try {
            this.close();
        } catch (error) {
            console.warn('[WARN]', '@egomobile/nats', error);
        }
    }
}

/**
 * A default NATS client instance, that can be used in a Kubernetes Pod e.g.
 */
export const stan = new NatsClient(defaultGetNatsClientOptions);

export type { Stan } from 'node-nats-streaming';
