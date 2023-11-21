import { Expression, Identifier } from "./index.js";

export class NewExpression extends Expression {
    public readonly type: 'NewExpression' = "NewExpression";
    public readonly arguments: readonly Expression[];
    constructor(
        public readonly callee: Identifier,
        args: readonly Expression[]
    ) {
        super();
        this.arguments = args;
    }
}