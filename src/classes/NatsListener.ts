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

import PQueue from 'p-queue';
import { Message, Stan, Subscription, SubscriptionOptions } from 'node-nats-streaming';
import { stan } from './NatsClient';
import type { NatsClient } from './NatsClient';
import type { Nilable } from '../types';

/**
 * A function, that returns the options for a NATS listener.
 *
 * @returns {INatsListenerOptions} The options.
 */
export type GetNatsListenerOptions = () => INatsListenerOptions;

/**
  * Context for an 'onMessage' event.
  */
export interface INatsEventMessageHandlerContext<TEvent extends any = any> {
    /**
      * The function to call, if message should be ack.
      */
    ack: () => void;
    /**
      * The parsed data.
      */
    message: TEvent;
    /**
      * The function to call, if message should NOT be ack.
      */
    noAck: () => void;
    /**
      * The raw NATS message.
      */
    rawMessage: Message;
}

/**
 * Options for instance of 'NatsListener'.
 */
export interface INatsListenerOptions {
    /**
     * Do an automatic ack on each message event or not. Default: (true)
     */
    autoAck?: boolean;
    /**
     * The underlying NATS client.
     */
    client: NatsClient;
    /**
     * The group name.
     */
    groupName: string;
    /**
     * Initial 'onMessage' event handler.
     */
    onMessage?: Nilable<OnNatsEventMessageHandler>;
}

/**
  * Handles a message.
  *
  * @param {INatsEventMessageHandlerContext<TEvent>} context The context.
  */
export type OnNatsEventMessageHandler<TEvent extends any = any> =
    (context: INatsEventMessageHandlerContext<TEvent>) => Promise<void>;

/**
 * A default function that uses the environment variable NATS_GROUP
 * and the default NATS client, to use in a Kubernetes POD.
 *
 * @returns {GetNatsListenerOptions} The options.
 */
export const defaultGetNatsListenerOptions: GetNatsListenerOptions = () => {
    const NATS_GROUP = process.env.NATS_GROUP!.trim();

    return {
        client: stan,
        groupName: NATS_GROUP
    };
};

/**
  * A NATS listener.
  *
  * @example
  * ```
  * import { NatsListener } from '@egomobile/nats'
  *
  * interface IMyEvent {
  *   foo: string;
  *   baz?: number;
  * }
  *
  * const myListener = new NatsListener<IMyEvent>('myEvent')
  *
  * myListener.onMessage = async ({ message }) => {
  * }
  *
  * myListener.listen()
  * ```
  */
export class NatsListener<TEvent extends any = any> {
    private _queue: Nilable<PQueue>;

    /**
      * Initializes a new instance of that class.
      *
      * @param {string} subject The subject / topic.
      * @param {INatsListenerOptions|GetNatsListenerOptions} [optionsOrFunction] Custom options or a function that provides it.
      */
    public constructor(
        public readonly subject: string,
        public readonly optionsOrFunction: INatsListenerOptions | GetNatsListenerOptions = defaultGetNatsListenerOptions
    ) {
        let getOptions: GetNatsListenerOptions;
        if (typeof optionsOrFunction === 'function') {
            getOptions = optionsOrFunction;
        } else {
            getOptions = () => optionsOrFunction;
        }

        if (typeof getOptions !== 'function') {
            throw new TypeError('optionsOrFunction must be an object or function');
        }

        // eslint-disable-next-line @typescript-eslint/naming-convention
        let { autoAck, client, groupName, onMessage } = getOptions();

        if (!groupName?.length) {
            throw new Error('No groupName defined');
        }

        if (typeof autoAck === 'undefined') {
            autoAck = true;
        }

        this.client = client;
        this.groupName = groupName;
        this.autoAck = autoAck;
        this.onMessage = onMessage;

        const options = this.stan.subscriptionOptions();
        {
            this.initSubscriptionOptions(options);
            this.subscriptionOptions = options;
        }
    }

    /**
      * Do an automatic ack on each message event or not.
      */
    public autoAck: boolean;

    /**
     * The underlying NATS client.
     */
    public readonly client: NatsClient;

    private getOnMessage(): Nilable<OnNatsEventMessageHandler<TEvent>> {
        const onMessage = this.onMessage;
        if (onMessage) {
            if (this._queue) {
                const onMessageWithQueue: OnNatsEventMessageHandler<TEvent> =
                    (context) => this._queue!.add(() => onMessage!(context));

                return onMessageWithQueue;
            }
        }

        return onMessage;
    }

    /**
      * The NATS group.
      */
    public readonly groupName: string;

    /**
      * Internal NATS client message handler.
      *
      * @param {Message} rawMessage The raw message.
      */
    protected handleSubscriptionMessage(rawMessage: Message): void {
        const tryAck = () => rawMessage.ack();

        let shouldAck = true;
        const ack = () => {
            shouldAck = true;

            if (!this.autoAck) {
                tryAck();
            }
        };
        const noAck = () => {
            shouldAck = false;
        };

        const onError = (error: any) => {
            console.error('[ERROR]', '@egomobile/nats', error);

            noAck();
        };
        const onSuccess = () => {
            if (this.autoAck && shouldAck) {
                tryAck();
            }
        };

        try {
            const onMessage = this.getOnMessage();
            if (onMessage) {
                let message: any;
                try {
                    message = parseMessage(rawMessage);
                } catch {
                    tryAck();  // JSON parse errors should not resend events
                    return;
                }

                onMessage({
                    ack,
                    message,
                    noAck,
                    rawMessage
                }).then(onSuccess)
                    .catch(onError);
            } else {
                onSuccess();
            }
        } catch (e) {
            onError(e);
        }
    }

    /**
      * Initializes the subscription options.
      *
      * @example
      * ```
      * import { NatsListener, SubscriptionOptions } from '@egomobile/nats'
      *
      * interface IMyEvent {
      *   foo: string;
      *   baz?: number;
      * }
      *
      * class MyEventListener extends NatsListener<IMyEvent> {
      *   protected initSubscriptionOptions(options: SubscriptionOptions) {
      *     options.setStartWithLastReceived()
      *       .setManualAckMode(false)
      *       .setAckWait(180 * 1000)
      *       .setDurableName(this.groupName)
      *   }
      * }
      * ```
      *
      * @param {SubscriptionOptions} options The "empty" options object.
      */
    protected initSubscriptionOptions(options: SubscriptionOptions) {
        options.setDeliverAllAvailable()
            .setManualAckMode(true)
            .setAckWait(60 * 1000)
            .setDurableName(this.groupName);
    }

    /**
      * Start listening.
      *
      * @example
      * ```
      * import { NatsListener } from '@egomobile/nats'
      *
      * interface IMyEvent {
      *   foo: string;
      *   baz?: number;
      * }
      *
      * const myListener = new NatsListener<IMyEvent>('myEvent')
      *
      * myListener.onMessage = async ({ message }) => {
      *   // handle message
      * }
      *
      * myListener.listen()
      * ```
      *
      * @returns {Subscription} The new subscription.
      */
    public listen(): Subscription {
        const subscription = this.stan.subscribe(
            this.subject,
            this.groupName,
            this.subscriptionOptions
        );

        subscription.on('message', this.handleSubscriptionMessage.bind(this));

        return subscription;
    }

    /**
      * Can be used to register a function, to receive event messages.
      *
      * @example
      * ```
      * const myListener = new NatsListener('myEvent')
      *
      * myListener.onMessage = async ({ message }) => {
      *   // handle message
      * }
      * ```
      */
    public onMessage?: Nilable<OnNatsEventMessageHandler<TEvent>>;

    /**
      * Gets the underlying basic NATS client.
      *
      * @returns {Stan} The underlying client.
      */
    public get stan(): Stan {
        return this.client.client;
    }

    /**
      * Sets up the size of an internal concurrency queue.
      *
      * @example
      * ```
      * import { NatsListener } from '@egomobile/nats'
      *
      * const myListener = new NatsListener()
      *
      * myListener.setQueueSize(1)  // handle only one message at once
      * ```
      *
      * @param {number} concurrency The new size of the queue.
      *                             If the value is not a valid number, the queue is deactivated.
      *
      * @returns {this} this
      */
    public setQueueSize(concurrency: Nilable<number>): this {
        if (concurrency !== null && typeof concurrency !== 'undefined') {
            if (typeof concurrency !== 'number') {
                throw new TypeError('concurrency must be a number or (null) or (undefined)');
            }

            this._queue = new PQueue({ concurrency });
        } else {
            this._queue = null;
        }

        return this;
    }

    /**
      * The subscription options.
      */
    public readonly subscriptionOptions: SubscriptionOptions;
}

function parseMessage(msg: Message) {
    const data = msg.getData();

    return typeof data === 'string'
        ? JSON.parse(data)
        : JSON.parse(data.toString('utf8'));
}

export type {
    Subscription,
    SubscriptionOptions
} from 'node-nats-streaming';
