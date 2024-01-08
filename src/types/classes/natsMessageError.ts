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

import type { JsMsg } from "nats";

/**
 * A NATS message error.
 */
export class NatsMessageError extends Error {
    /**
     * Initializes a new instance of that class.
     * @param {any} cause The inner error.
     * @param {JsMsg} msg The message that had thrown the error in `cause`.
     * @param {string} message The inner and additional message text, if needed.
     */
    constructor(
        public readonly cause: any,
        public readonly msg: JsMsg,
        message?: string
    ) {
        super(message);
    }
}
