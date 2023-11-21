import { ArrowFunctionExpression, CallExpression, ColumnDeclaration, ColumnExpression, Expression, GroupingExpression, Identifier, MemberExpression, NewObjectExpression, ObjectExpression, ObjectProperty, ProjectorExpression, PropertyProjector, SelectExpression } from "../expressions/index.js";
import { ExpressionVisitor, paramValues, Scope } from "./expression.visitor.js";

export class ProjectorFlattenVisitor extends ExpressionVisitor<any>{

    private columns: readonly ColumnDeclaration[];
    flatten(columns: readonly ColumnDeclaration[], projector: ProjectorExpression) {
        this.columns = columns;
        return this.visit(projector);
    }

    private visitNewObject(newObject: NewObjectExpression, scope: Scope) {
        const value = new newObject.objectType();
        for (const pp of newObject.propertyProjectors) {
            if (pp.property === "name") {
                
            }
            value[pp.property] = this.visit(pp.value);
        }
        return value;
    }

    private visitIdentifier(identifier: Identifier, scope: Scope) {
        const value = this.resolveFromScope([identifier.name], scope);
        if (value) { return value; }
        return this.visit(this.columns.find(c => c.name === identifier.name));

    }

    private visitMemberExpression(member: MemberExpression, scope) {
        const identifiers = this.getIdentifiers(member);
        const value = this.resolveFromScope(identifiers, scope);
        if (value) {
            return value;
        }
        if (this.columns) {
            const column = this.columns.find(c => c.alias === (member.object as Identifier).name && (c.expression as ColumnExpression).columnName === member.property.name);
            return column;
        } else {
            const valueFromScope = this.resolveFromScope(identifiers, scope);
            if (valueFromScope !== undefined) return valueFromScope;
        }
    }

    private visitColumnDeclaration(columnDeclaration: ColumnDeclaration) {
        return columnDeclaration;
    }

    private visitGrouping(grouping: GroupingExpression, scope) {
        const groupingNewObject = new NewObjectExpression(Object, [new PropertyProjector("key", grouping.key as any), new PropertyProjector("aggregates", grouping.aggregates as any), new PropertyProjector("elements", grouping.elements as any)]);
        const groupingProjector = this.visitNewObject(groupingNewObject, scope) as any;
        return this.visit(grouping.map, { ...scope, ...{ [paramValues]: [groupingProjector.key, groupingProjector.aggregates, groupingProjector.elements] } });
    }

    private visitObjectExpression(objectExpression: ObjectExpression, scope: Scope) {
        const value = new Object();

        for (const property of objectExpression.properties) {
            value[property.key.name] = this.visit(property.value, scope);
        }
        return value;
    }

    private callMap(map: CallExpression, scope: Scope) {
        const identifiers = this.getIdentifiers(map.callee);
        identifiers.pop();
        const value = this.resolveFromScope(identifiers, scope);
        return this.visit(map.arguments[0], { ...scope, ...{ [paramValues]: [value] } });
    }
}
