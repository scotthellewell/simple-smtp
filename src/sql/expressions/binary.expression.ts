import { Expression } from "./index.js";

export class BinaryExpression extends Expression {
    public readonly type: 'BinaryExpression' = "BinaryExpression";
    constructor(
        public readonly left: Expression,
        public readonly right: Expression,
        public readonly operator: string
    ) {
        super();
        if (!right) {
            throw new Error("right value must be an expression.  This usually indicates that you forgot to add something to scope.");
        }
    }
}
export class UnaryExpression extends Expression {
    public readonly type: 'UnaryExpression' = "UnaryExpression";
    constructor(
        public readonly argument: Expression,
        public readonly operator: string
    ) {
        super();
        if (!argument) {
            throw new Error("argument value must be an expression.  This usually indicates that you forgot to add something to scope.");
        }
    }
}

export class ConditionalExpression extends Expression {
    public readonly type: 'ConditionalExpression' = "ConditionalExpression";
    constructor(
        public readonly test: Expression,
        public readonly consequent: Expression,
        public readonly alternate: Expression
    ){
        super();
    }
}