/* eslint-disable unicorn/filename-case */

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

import type { Stan } from 'node-nats-streaming';
import { stan } from './NatsClient';
import type { NatsClient } from './NatsClient';

/**
 * A function, that returns the options for a NATS publisher.
 *
 * @returns {INatsPublisherOptions} The options.
 */
export type GetNatsPublisherOptions = () => INatsPublisherOptions;

/**
 * Options for a 'NatsPublisher' instance.
 */
export interface INatsPublisherOptions {
    /**
     * The underlying NATS client.
     */
    client: NatsClient;
}

/**
 * A default function that uses the environment variable NATS_GROUP
 * and the default NATS client, to use in a Kubernetes POD.
 *
 * @returns {INatsPublisherOptions} The options.
 */
export const defaultGetNatsPublisherOptions: GetNatsPublisherOptions = () => ({
    client: stan
});

/**
  * A basic NATS event publisher.
  *
  * @example
  * ```
  * import { NatsPublisher } from '@egomobile/nats'
  *
  * interface IMyEvent {
  *   foo: string;
  *   baz?: number;
  * }
  *
  * const myPublisher = new NatsPublisher<IMyEvent>()
  *
  * await myPublisher.publish({
  *   foo: 'bar',
  *   baz: 5979
  * })
  * ```
  */
export class NatsPublisher<TEvent extends any = any> {
    /**
      * Initializes a new instance of that class.
      *
      * @param {string} subject The subject.
      * @param {INatsListenerOptions|GetNatsListenerOptions} [optionsOrFunction] Custom options or a function that provides it.
      */
    public constructor(
        public readonly subject: string,
        public readonly optionsOrFunction: INatsPublisherOptions | GetNatsPublisherOptions = defaultGetNatsPublisherOptions
    ) {
        let getOptions: GetNatsPublisherOptions;
        if (typeof optionsOrFunction === 'function') {
            getOptions = optionsOrFunction;
        } else {
            getOptions = () => optionsOrFunction;
        }

        if (typeof getOptions !== 'function') {
            throw new TypeError('optionsOrFunction must be an object or function');
        }

        const { client } = getOptions();

        this.client = client;
    }

    /**
     * The underlying NATS client.
     */
    public readonly client: NatsClient;

    /**
      * Publishes data.
      *
      * @param {TEvent} data The data to publish.
      *
      * @example
      * ```
      * import { NatsPublisher } from '@egomobile/nats'
      *
      * interface IMyEvent {
      *   foo: string;
      *   baz?: number;
      * }
      *
      * const myPublisher = new NatsPublisher<IMyEvent>()
      *
      * await myPublisher.publish({
      *   foo: 'bar',
      *   baz: 5979
      * })
      * ```
      *
      * @returns {Promise<void>} The promise.
      */
    public publish(data: TEvent): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            try {
                this.stan.publish(this.subject, Buffer.from(JSON.stringify(data), 'utf8'), (err) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve();
                    }
                });
            } catch (e) {
                reject(e);
            }
        });
    }

    /**
      * Gets the underlying raw client.
      *
      * @returns {Stan} The client.
      */
    public get stan(): Stan {
        return this.client.client;
    }
}
