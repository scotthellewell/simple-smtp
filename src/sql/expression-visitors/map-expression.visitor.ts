import { CallExpression, ColumnDeclaration, ColumnExpression, Expression, Identifier, NewObjectExpression, NullLiteral, NumericLiteral, ProjectorExpression, PropertyProjector, SelectExpression, StringLiteral } from "../expressions/index.js";
import { ExpressionVisitor } from "./expression.visitor.js";

export class MapExpressionVisitor extends ExpressionVisitor<Expression>{
    private columns: ColumnDeclaration[];
    private select: SelectExpression;

    mapSelect(select: SelectExpression, map: ProjectorExpression): SelectExpression {
        this.select = select;
        this.columns = [];
        const projector = this.visit(map) as ProjectorExpression;
        return new SelectExpression(select.alias, this.columns, select, [], null, [], select.orderBy, projector, false);
    }

    addColumn(column: ColumnDeclaration) {
        if (this.columns.findIndex(c => c.alias == column.alias && c.name == column.name) === -1) {
            this.columns.push(column);
        }
    }
    private calls = 0;
    protected visitCallExpression(call: CallExpression) {
        const alias = `${this.select.alias}_call_${call.callee.property.name}_${this.calls++}`;
        this.addColumn(new ColumnDeclaration(this.select.alias, alias, call));
        this.visit(call.callee.object);
        for (const arg of call.arguments) {
            this.visit(arg);
        }
        return new Identifier(alias);
    }

    private visitNumericLiteral(literal: NumericLiteral) {
        return literal;
    }

    private visitStringLiteral(literal: StringLiteral) {
        return literal;
    }

    private visitNullLiteral(literal: NullLiteral) {
        return literal;
    }

    private visitNewObject(newObj: NewObjectExpression): NewObjectExpression {
        const propertyProjectors: PropertyProjector[] = [];
        for (const projector of newObj.propertyProjectors) {
            propertyProjectors.push(this.visitPropertyProjector(projector));
        }
        return new NewObjectExpression(newObj.objectType, propertyProjectors);
    }

    private visitPropertyProjector(projector: PropertyProjector): PropertyProjector {
        return new PropertyProjector(projector.property, this.visit(projector.value) as ColumnDeclaration | CallExpression | NewObjectExpression | ColumnExpression);
    }

    private visitColumnDeclaration(columnDeclaration: ColumnDeclaration): ColumnDeclaration {
        const expression = this.visit(columnDeclaration.expression);
        return new ColumnDeclaration(this.select.alias, columnDeclaration.name, expression as ColumnExpression | CallExpression);
    }

    private visitColumn(column: ColumnExpression): ColumnExpression {
        const columnDeclaration = this.select.columns.find(c => c.expression.type === "Column" ? c.expression.columnName === column.columnName : null);
        const newColumn = new ColumnExpression(columnDeclaration.name, columnDeclaration.name);
        this.addColumn(new ColumnDeclaration(this.select.alias, columnDeclaration.name, newColumn));
        return newColumn;
    }

    private visitIdentifier(identifier: Identifier) {
        const columnDefinition = this.select.columns.find(c => c.name == identifier.name);
        return this.visitColumnDeclaration(columnDefinition);
    }

}