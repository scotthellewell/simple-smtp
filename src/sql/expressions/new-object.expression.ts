import { Class, Expression, PropertyProjector } from "./index.js";

export class NewObjectExpression extends Expression {
    public readonly type: 'NewObject' = 'NewObject';
    constructor(
        public readonly objectType: Class<unknown>,
        public readonly propertyProjectors: readonly PropertyProjector[]
    ) {
        super();
    }
}