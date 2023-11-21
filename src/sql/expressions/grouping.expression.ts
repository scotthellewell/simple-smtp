import { Expression, ProjectorExpression } from "./index.js";

export class GroupingExpression extends Expression {
    type: "Grouping" = "Grouping";
    constructor(
        public readonly key: ProjectorExpression,
        public readonly aggregates: ProjectorExpression,
        public readonly elements: ProjectorExpression,
        public readonly map: ProjectorExpression,
        public readonly mapColumns: ProjectorExpression
    ) {
        super();
    }
}