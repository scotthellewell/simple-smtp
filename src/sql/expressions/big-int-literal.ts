import { Expression } from "./index.js";

export class BigIntLiteral extends Expression {
    public readonly type: "BigIntLiteral" = "BigIntLiteral";
    constructor(public readonly value: BigInt) {
        super();
    }
}