import { Expression } from "./index.js";

export class StringLiteral extends Expression {
    public readonly type: "StringLiteral" = "StringLiteral";
    constructor(public readonly value: string) {
        super();
    }
}
