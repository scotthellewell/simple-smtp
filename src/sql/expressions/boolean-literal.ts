import { Expression } from "./index.js";

export class BooleanLiteral extends Expression {
    type: "BooleanLiteral" = "BooleanLiteral";
    constructor(public readonly value: boolean) {
        super();
    }
}