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

import fs from 'fs';
import path from 'path';
import { NatsClient, stan } from '../classes';
import type { Nilable } from '../types';

/**
 * Options for 'loadNatsListeners()' functions.
 */
export interface ILoadNatsListenersOptions {
    /**
     * The custom client to use.
     */
    client?: Nilable<NatsClient>;
    /**
     * The directory, where the script files are stored.
     */
    dir?: Nilable<string>;
    /**
     * The custom file filter to use.
     *
     * If a string: It is used to check the extension of a file path.
     * If a function: Takes file, if truely.
     *
     * By default, the file extension is checked.
     */
    filter?: Nilable<string | LoadNatsListenerFileFilter>;
}

/**
 * Arguments for a 'SetupNatsListenerAction'.
 */
export interface ISetupNatsListenerActionArguments {
    /**
     * The preferred client to use.
     */
    client: NatsClient;
    /**
     * Recommend name of listener.
     */
    name: string;
}

/**
 * A file filter for 'ILoadNatsListenersOptions' options.
 *
 * @param {string} name The base name of the file.
 * @param {string} fullPath The full path of the file to check.
 *
 * @returns {boolean} Import file or not.
 */
export type LoadNatsListenerFileFilter = (name: string, fullPath: string) => boolean;

/**
 * An action to setup a NATS listener.
 *
 * @param {ISetupNatsListenerActionArguments} args Arguments for the action.
 *
 * @returns {any} An object, that represents a listener, like its subscription object.
 */
export type SetupNatsListenerAction = (args: ISetupNatsListenerActionArguments) => any;

/**
 * Loads NATS listeners from script files of a directory and starts them.
 *
 * @example
 * ```
 * import { stan } from "@egomobile/nats"
 *
 * // scan all .ts files in 'listeners' sub folder
 * // and execute all exported functions, which are
 * // exported by 'default' or directly as CommonJS
 * // function
 * const subscriptions: any[] = await loadNatsListeners({
 *   dir: __dirname + '/listener',
 *   filter: '.ts'
 * })
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
 *
 * @param {Nilable<ILoadNatsListenersOptions>} [options] Custom options.
 *
 * @returns {Promise<any[]>} The promise with the values, that represent the running listeners.
 */
export async function loadNatsListeners(options?: Nilable<ILoadNatsListenersOptions>): Promise<any[]> {
    const { client, dir, filter } = getOptions(options);

    const subscriptions: any[] = [];

    for (const item of await fs.promises.readdir(dir)) {
        const fullPath = path.join(dir, item);

        const stats = await fs.promises.stat(fullPath);

        const setupListener = loadModuleOfSetupAction(fullPath, stats, filter);
        if (typeof setupListener !== 'function') {
            continue;  // we have no function here => skip
        }

        // base name without extension
        const name = path.basename(item, path.extname(item));

        const result = await setupListener({
            client,
            name
        });
        if (result) {
            subscriptions.push(result);
        }
    }

    return subscriptions;
}

/**
 * Loads NATS listeners from script files of a directory and starts them.
 *
 * @example
 * ```
 * import { stan } from "@egomobile/nats"
 *
 * // scan all .ts files in 'listeners' sub folder
 * // and execute all exported functions, which are
 * // exported by 'default' or directly as CommonJS
 * // function
 * const subscriptions: any[] = loadNatsListenersSync({
 *   dir: __dirname + '/listener',
 *   filter: '.ts'
 * })
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
 *
 * @param {Nilable<ILoadNatsListenersOptions>} [options] Custom options.
 *
 * @returns {any[]} The values, that represent the running listeners.
 */
export function loadNatsListenersSync(options?: Nilable<ILoadNatsListenersOptions>): any[] {
    const { client, dir, filter } = getOptions(options);

    const subscriptions: any[] = [];

    for (const item of fs.readdirSync(dir)) {
        const fullPath = path.join(dir, item);

        const stats = fs.statSync(fullPath);

        const setupListener = loadModuleOfSetupAction(fullPath, stats, filter);
        if (typeof setupListener !== 'function') {
            continue;  // we have no function here => skip
        }

        // base name without extension
        const name = path.basename(item, path.extname(item));

        const result = setupListener({
            client,
            name
        });
        if (result) {
            subscriptions.push(result);
        }
    }

    return subscriptions;
}

function getOptions(options: Nilable<ILoadNatsListenersOptions>) {
    let client = options?.client;
    if (!client) {
        client = stan;
    }

    let dir = options?.dir;
    if (!dir) {
        dir = path.join(process.cwd());
    }

    if (typeof dir !== 'string') {
        throw new TypeError('dir must be a string');
    }

    let filter = options?.filter;
    if (filter) {
        if (typeof filter === 'string') {
            filter = (f) => f.endsWith(filter as string);
        }
    } else {
        filter = (f) => f.endsWith('.js');
    }

    if (typeof filter !== 'function') {
        throw new TypeError('filter must be a string or function');
    }

    return {
        client,
        dir,
        filter
    };
}

function loadModuleOfSetupAction(fullPath: string, stats: fs.Stats, filter: LoadNatsListenerFileFilter): SetupNatsListenerAction | void | undefined | null {
    if (!stats.isFile()) {
        return; // no file
    }

    const name = path.dirname(fullPath);

    if (!filter(name, fullPath)) {
        return;  // filter criteria does not match
    }

    // load module
    const moduleOrFunction = require(fullPath);

    // first try 'default' export
    let setupListener: SetupNatsListenerAction | null | undefined = require(fullPath).default;
    if (!setupListener) {
        setupListener = moduleOrFunction;  // now try CommonJS
    }

    return typeof setupListener === 'function' ?
        setupListener :
        null;
}
