import { ColumnDeclaration, Expression, JoinExpression, OrderByExpression, NewObjectExpression, CallExpression, PropertyProjector, GroupingExpression, ProjectorExpression } from "./index.js";

export class SelectExpression extends Expression {
    public readonly type: 'Select' = 'Select';
    constructor(
        public readonly alias: string,
        public readonly columns: readonly ColumnDeclaration[] = [],
        public readonly from: Expression,
        public readonly joins: readonly JoinExpression[] = [],
        public readonly where: Expression,
        public readonly groupBys: readonly ColumnDeclaration[] = [],
        public readonly orderBy: readonly OrderByExpression[] = [],
        public readonly projector: ProjectorExpression,
        public readonly distinct: boolean
    ) {
        super();
    }

    get isSimpleSelect(): boolean {
        return !this.where && this.joins.length === 0 && this.groupBys.length === 0 && !this.distinct; 
    }
}
