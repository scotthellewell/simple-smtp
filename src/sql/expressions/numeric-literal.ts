import { Expression } from "./index.js";

export class NumericLiteral extends Expression {
    public readonly type: "NumericLiteral" = "NumericLiteral";
    constructor(public readonly value: number) {
        super();
    }
}