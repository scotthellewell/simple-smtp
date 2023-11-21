
import { parseExpression } from "@babel/parser";
import { NumericLiteral, BinaryExpression, CallExpression, ColumnDeclaration, ColumnExpression, DataSource, Expression, getColumns, Identifier, JoinExpression, MemberExpression, NewObjectExpression, NullLiteral, ObjectExpression, OrderByExpression, PropertyProjector, SelectExpression, StringLiteral, ProjectorExpression, GroupingExpression, BigIntLiteral, BooleanLiteral, SqlExpression, NewExpression, UnaryExpression } from "../expressions/index.js";
import { ExpressionVisitor, params, paramValues, Scope } from "./expression.visitor.js";
import { MapExpressionVisitor } from "./map-expression.visitor.js";
import { ProjectorFlattenVisitor } from "./projector-flatten.visitor.js";

export class DatabaseExpressionVisitor extends ExpressionVisitor<Expression> {

    public execute(expression: Expression) {
        return this.visit(expression);
    }

    private aliasCount: number = 0;
    private getNextAlias() {
        return "t" + this.aliasCount++;
    }


    protected visitCallExpression(call: CallExpression, scope: Scope): Expression {
        scope = { ...scope, ...call.scope };
        const callMethod = this[`call${call.callee.property.name.charAt(0).toUpperCase()}${call.callee.property.name.substring(1)}`];
        if (callMethod) {
            return callMethod.bind(this)(call, scope);
        } else {
            const identifiers = this.getIdentifiers(call.callee);
            const method = identifiers.pop();
            const object = this.resolveFromScope(identifiers, scope);
            const args = call.arguments.map(arg => this.visit(arg, scope));
            return new CallExpression(object, method, args, scope);
        }
    }

    protected visitDataSource(datasource: DataSource<unknown>, scope: Scope) {
        const alias = this.getNextAlias();
        const columns = getColumns(datasource.elementType);
        const columnDeclarations: ColumnDeclaration[] = [];
        const propertyProjectors: PropertyProjector[] = [];
        for (const column of columns) {
            columnDeclarations.push(new ColumnDeclaration(alias, alias + "_" + column.propertyName, new ColumnExpression(column.columnName, column.propertyName)));
            const propertyProjector = new PropertyProjector(column.propertyName, new Identifier(alias + "_" + column.propertyName));
            propertyProjectors.push(propertyProjector);
        }
        const rowProjector = new NewObjectExpression(datasource.elementType, propertyProjectors);
        return new SelectExpression(alias, columnDeclarations, datasource, [], null, [], [], rowProjector, false);
    }

    private callDistinct(call: CallExpression, scope: Scope) {
        const select = this.visit(call.callee.object, scope) as SelectExpression;
        return new SelectExpression(select.alias, select.columns, select.from, select.joins, select.where, select.groupBys, select.orderBy, select.projector, true);
    }

    private callJoin(call: CallExpression, scope: Scope) {
        const object = this.visit(call.callee.object, scope) as SelectExpression;
        if (object.type === "Select") {
            const select = object; //this.visit(call.callee.object, scope) as SelectExpression;
            const joins = (select.joins) ? select.joins.slice() : [];
            const newJoin = this.visit(call.arguments[0], scope) as SelectExpression;
            const columns = select.columns.slice();
            const joinType = call.arguments[3] as StringLiteral;
            if (newJoin.isSimpleSelect) {
                for (let column of newJoin.columns) {
                    columns.push(column);
                }
            } else {
                for (let column of newJoin.columns) {
                    const newColumn = new ColumnDeclaration(column.alias, column.name,
                        new ColumnExpression(column.name, column.expression.type === "Column" ? column.expression.propertyName : null));
                    columns.push(newColumn);
                }
            }
            scope = { ...scope, ...{ [paramValues]: [select, newJoin] } };
            const on = this.visit(call.arguments[1], scope);
            const projector = this.visit(call.arguments[2], scope) as NewObjectExpression;
            joins.push(new JoinExpression(newJoin, on, joinType));
            return new SelectExpression(select.alias, columns, select.from, joins, select.where, select.groupBys, select.orderBy, projector, false);
        }
        else if (call.callee.object.type === "Identifier") {
            const identifiers = this.getIdentifiers(call.callee);
            identifiers.pop();
            const object = this.resolveFromScope(identifiers, scope);
            const property = this.visit(call.arguments[0], scope);
            const separator = this.visit(call.arguments[1], scope);
            return new CallExpression(object, "join", [property, separator], scope);
        }
        else {
            throw new Error("Not Implemented");
        }
    }

    private visitObjectExpression(objectExp: ObjectExpression, scope: Scope) {
        const propertyProjectors: PropertyProjector[] = [];
        for (const property of objectExp.properties) {
            if (property.value.type === "ObjectExpression") {
                propertyProjectors.push(new PropertyProjector(property.key.name, this.visitObjectExpression(property.value, scope)));
            } else if (property.value.type === "Identifier") {
                const identifiers = this.getIdentifiers(property.value);
                let value = this.resolveFromScope(identifiers, scope);
                propertyProjectors.push(new PropertyProjector(property.key.name, value));
            } else {
                const value = this.visit(property.value, scope);
                propertyProjectors.push(new PropertyProjector(property.key.name, value as any));
            }
        }
        return new NewObjectExpression(Object, propertyProjectors);
    }

    private callFilter(filter: CallExpression, scope: Scope) {
        const select: SelectExpression = this.visit(filter.callee.object) as SelectExpression;
        let where = this.visit(filter.arguments[0], { ...scope, ...{ [paramValues]: [select] } });
        if (select.where) {
            where = new BinaryExpression(select.where, where, '&&');
        }
        return new SelectExpression(select.alias, select.columns, select.from, select.joins, where, select.groupBys, select.orderBy, select.projector, select.distinct);
    }

    private callSlice(slice: CallExpression, scope: Scope) {
        const select: SelectExpression = this.visit(slice.callee.object) as SelectExpression;
        scope = { ...scope, ...{ [paramValues]: [select] } };
        const columnsWithRow = select.columns.slice();
        const rowColumnDef = new ColumnDeclaration(select.alias, `${select.alias}__Row__`, new CallExpression(select, "rowNumber", null, scope));
        columnsWithRow.push(rowColumnDef);
        const projectorWithRow = new NewObjectExpression(Object, [new PropertyProjector("rowNumber", rowColumnDef), new PropertyProjector("value", select.projector as any)]);
        const selectWithRow = new SelectExpression(select.alias, columnsWithRow, select.from, select.joins, select.where, select.groupBys, [], projectorWithRow, select.distinct);
        const rowColumn = new ColumnDeclaration(selectWithRow.alias, `${selectWithRow.alias}__Row__`, new ColumnExpression(`${selectWithRow.alias}__Row__`, null));
        const columns: ColumnDeclaration[] = [rowColumn];
        for (const c of select.columns) {
            columns.push(new ColumnDeclaration(
                selectWithRow.alias,
                c.name,
                new ColumnExpression(
                    c.name,
                    c.expression.type === "Column" ? c.expression.propertyName : null)));
        }
        const rowExpression = new BinaryExpression(rowColumn, new NumericLiteral(1), "-");
        let start = this.visit(slice.arguments[0], scope) as NumericLiteral | NullLiteral;
        const end = this.visit(slice.arguments[1], scope) as NumericLiteral | NullLiteral;
        if (start.type === "NullLiteral") {
            start = new NumericLiteral(0);
        }
        let where: Expression;
        if (end.type === "NullLiteral") {
            where = new BinaryExpression(rowExpression, start, ">=");
        } else {
            where = new CallExpression(rowExpression, "between", [start, end], scope);
        }
        return new SelectExpression(select.alias, columns, selectWithRow, [], where, select.groupBys, select.orderBy, select.projector, false);
    }

    private callSort(sort: CallExpression, scope: Scope) {
        const select = this.visit(sort.callee.object) as SelectExpression;
        const flattener = new ProjectorFlattenVisitor();
        const flatProjector = flattener.flatten(select.columns, select.projector)
        const property = this.visit(sort.arguments[0], { ...scope, ...{ [paramValues]: [flatProjector] } }) as ColumnDeclaration;
        const direction: StringLiteral = sort.arguments[1] as StringLiteral;
        const orderBy = select.orderBy ? select.orderBy.slice() : [];
        orderBy.push(new OrderByExpression(property, direction))
        return new SelectExpression(select.alias, select.columns, select.from, select.joins, select.where, select.groupBys, orderBy, select.projector, select.distinct);
    }

    private callMap(map: CallExpression, scope: Scope) {
        const identifiers = this.getIdentifiers(map.callee);
        identifiers.pop();
        const value = this.resolveFromScope(identifiers, scope);
        let newscope;
        if (value) {
            newscope = { ...scope, [paramValues]: [value] };
            const mapExpression = this.visit(map.arguments[0], newscope) as ProjectorExpression;
            return mapExpression;
        }
        else {
            const select = this.visit(map.callee.object, scope) as SelectExpression;
            newscope = { ...scope, ...{ [paramValues]: [select] } }
            const mapExpressionVisitor = new MapExpressionVisitor();
            const mapExpression = this.visit(map.arguments[0], newscope) as ProjectorExpression;
            return mapExpressionVisitor.mapSelect(select, mapExpression);
        }
    }

    private callGroupBy(groupBy: CallExpression, scope: Scope) {
        const mapExpressionVisitor = new MapExpressionVisitor();
        const select = this.visit(groupBy.callee.object) as SelectExpression;
        const keyMapExpression = this.visit(groupBy.arguments[0], { ...scope, ...{ [paramValues]: [select] } }) as ProjectorExpression;
        const aggregatesMapExpression = this.visit(groupBy.arguments[1], { ...scope, ...{ [paramValues]: [select] } }) as ProjectorExpression;
        let keySelect = mapExpressionVisitor.mapSelect(select, keyMapExpression);
        let aggregateSelect = mapExpressionVisitor.mapSelect(select, aggregatesMapExpression);
        const alias = this.getNextAlias();
        const keyColumns = keySelect.columns.map(c => new ColumnDeclaration(alias, c.name, c.expression));
        const aggregateColumns = aggregateSelect.columns.map(c => new ColumnDeclaration(alias, c.name, c.expression));
        const keyAndAggregateProjector = new NewObjectExpression(Object, [new PropertyProjector("key", keySelect.projector as any), new PropertyProjector("aggregates", aggregateSelect.projector as any)])
        const keyAndAggregateSelect = new SelectExpression(alias, keyColumns.concat(aggregateColumns), keySelect.from, [], keySelect.where, keyColumns, keySelect.orderBy, keyAndAggregateProjector, false);
        let on: BinaryExpression;
        for (const column of keySelect.columns) {
            const left = new ColumnDeclaration(alias, column.name, column.expression);
            const right = new ColumnDeclaration(select.alias, column.name, column.expression);
            let comparer = new BinaryExpression(left, right, "===");
            const comparerNull = new BinaryExpression(new BinaryExpression(left, new NullLiteral(), "==="), new BinaryExpression(right, new NullLiteral(), "==="), "&&")
            comparer = new BinaryExpression(comparer, comparerNull, '||');
            if (on) {
                on = new BinaryExpression(on, comparer, "&&");
            } else {
                on = comparer;
            }
        }
        const join = new JoinExpression(select, on, new StringLiteral("Inner"));
        const joinedColumns: ColumnDeclaration[] = [];
        for (const column of keyAndAggregateSelect.columns) {
            joinedColumns.push(new ColumnDeclaration(keyAndAggregateSelect.alias, column.name, new ColumnExpression(column.name, column.name)));
        }
        for (const column of join.from.columns) {
            joinedColumns.push(new ColumnDeclaration(join.from.alias, column.name, new ColumnExpression(column.name, column.name)));
        }
        const projector = new GroupingExpression(keySelect.projector, aggregateSelect.projector, select.projector, groupBy.arguments[2] as any, null);
        const joinedSelect = new SelectExpression(keyAndAggregateSelect.alias, joinedColumns, keyAndAggregateSelect, [join], null, [], keySelect.orderBy, projector, false);
        return joinedSelect;
    }

    visitUnaryExpression(unary: UnaryExpression, scope: Scope) {
        const argument = this.visit(unary.argument, scope);
        return new UnaryExpression(argument, unary.operator);
    }

    protected visitBinaryExpression(binary: BinaryExpression, scope: Scope) {
        try {
            const left = this.visit(binary.left, scope);
            const operator = this.visitOperator(binary.operator);
            const right = this.visit(binary.right, scope);
            return new BinaryExpression(left, right, operator);
        }
        catch (error) {
            console.error(error);
        }
    }

    // private visitOptionalMemberExpression(member: MemberExpression, scope: Scope) {
    //     this.visitMemberExpression(member, scope, true);
    // }
    private visitMemberExpression(member: MemberExpression, scope: Scope, optional = false) {
        const identifiers = this.getIdentifiers(member);
        const value = this.resolveFromScope(identifiers, scope);
        if (value === null) {
            return new NullLiteral();
        }
        if (value !== undefined) {
            switch (typeof value) {
                case "bigint":
                    return new BigIntLiteral(value);
                case "boolean":
                    return new BooleanLiteral(value);
                case "number":
                    return new NumericLiteral(value);
                case "string":
                    return new StringLiteral(value);
                case "object":
                    switch (value.constructor.name) {
                        case "Date":
                            return new NewExpression(new Identifier("Date"), [new StringLiteral(value.toString())]);
                        case "ColumnDeclaration":
                        case "NewObjectExpression":

                            return value;
                    }
                default:
                    throw new Error("Not Implemented: " + typeof value);
            }
        }
    }

    private visitStringLiteral(stringLiteral: StringLiteral, scope: Scope) {
        return stringLiteral;
    }

    private visitNumericLiteral(numericLiteral: NumericLiteral) {
        return numericLiteral;
    }

    private visitBooleanLiteral(booleanLiteral: BooleanLiteral) {
        return booleanLiteral;
    }

    private visitNullLiteral(nullLiteral: NullLiteral) {
        return nullLiteral;
    }

    private visitIdentifier(identifier: Identifier, scope: Scope) {
        const value = this.resolveFromScope([identifier.name], scope);
        if (value !== undefined) {
            switch (typeof value) {
                case "number":
                    return new NumericLiteral(value);
                case "string":
                    return new StringLiteral(value);
                case "boolean":
                    return new BooleanLiteral(value);
                default:
                    if (value.type === "NewObject") {
                        return value;
                        // const index = scope[params].indexOf(identifier.name);
                        // const select = scope[paramValues][index] as SelectExpression;
                        // return select.projector;
                    }
                    if (value.type === "ColumnDeclaration") {
                        return value;
                    }
                    if (value instanceof Date) {
                        return parseExpression(`new Date(${JSON.stringify(value)})`);
                    }
                    throw new Error("Unhandled Type:" + typeof value);
            }
            return value;
        } else {
            const index = scope[params].indexOf(identifier.name);
            const select = scope[paramValues][index] as SelectExpression;
            return select.projector;
        }
    }

    visitBlockStatement(blockStatement: any) {
        if (blockStatement.body.length === 0) {
            return new NewObjectExpression(Object, []);
        }
        throw new Error("Not Implemented.");
    }

    private visitSql(sql: SqlExpression) {
        return sql;
    }

    private visitLogicalExpression(expression: Expression, scope: Scope) {
        return this.visitBinaryExpression(expression as BinaryExpression, scope);
    }

    private visitNewExpression(expression: NewExpression, scope: Scope) {
        return expression;
    }
}
