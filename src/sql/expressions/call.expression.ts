import { Scope } from "../expression-visitors/expression.visitor.js";
import { Expression, Identifier, MemberExpression } from "./index.js";

export class CallExpression extends Expression {
    public readonly type: 'CallExpression' = 'CallExpression';
    public readonly callee: MemberExpression;
    public readonly arguments: readonly Expression[]
    constructor(
        object: Expression, methodName: string,
        args: readonly Expression[],
        public readonly scope: Scope
    ) {
        super();
        this.callee = new MemberExpression(object, new Identifier(methodName));
        this.arguments = args
    }
}
