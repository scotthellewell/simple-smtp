import { Expression } from "./index.js";

export class Identifier extends Expression {
    public readonly type: 'Identifier' = 'Identifier';
    constructor(public readonly name: string) {
        super();
    }
}
