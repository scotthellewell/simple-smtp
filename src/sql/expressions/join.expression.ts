import { SelectExpression } from "./index.js";
import { Expression } from "./expression.js";
import { StringLiteral } from "./string-literal.js";

export class JoinExpression extends Expression {
    public readonly type: 'Join' = "Join";
    constructor(
        public readonly from: SelectExpression,
        public readonly on: Expression,
        public readonly joinType: StringLiteral
    ) {
        super();
    }
}