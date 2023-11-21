import { ProjectorExpression } from "../expressions/index.js";
import equal from "deep-equal";
import { ProjectorVisitor } from "./projector.visitor.js";

export class GroupingVisitor {
    groupResults(rows: { key: any, aggregates: any, elements: any }[], projector: ProjectorExpression) {
        if (projector.type !== "Grouping") {
            return rows;
        } else {
            const values: { key: any, aggregates: any, elements: any[] }[] = [];
            let value: { key: any, aggregates: any, elements: any[] };
            for (const row of rows) {
                if (!value || !equal(row.key, value.key)) {
                    value = values.find(r => equal(row.key, r.key));
                    if (!value) {
                        value = { key: row.key, aggregates: row.aggregates, elements: [] };
                        values.push(value);
                    }
                }
                value.elements.push(row.elements);
            }
            const mappedValues = [];
            const projectorVisitor = new ProjectorVisitor();
            for (const row of values) {
                const value = projectorVisitor.project(null, null, projector.map, [row.key, row.aggregates, row.elements]);
                mappedValues.push(value);
            }
            return mappedValues;
        }
    }
}