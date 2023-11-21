import { Expression, Identifier } from "./index.js";

export class ArrowFunctionExpression extends Expression {
    public readonly type: 'ArrowFunctionExpression' = "ArrowFunctionExpression";
    constructor(
        public readonly body: Expression,
        public readonly params: readonly Identifier[]
    ) {
        super();
    }
}