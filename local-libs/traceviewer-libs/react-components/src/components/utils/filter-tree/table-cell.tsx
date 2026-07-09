import * as React from 'react';
import { TreeNode } from './tree-node';
import { createLegendSwatch } from './utils';

interface TableCellProps {
    node: TreeNode;
    index: number;
    legendColumnIndex?: number;
    legendColors?: Record<number, string>;
    children?: React.ReactNode | React.ReactNode[];
    pinButton?: React.ReactNode;
}

export class TableCell extends React.Component<TableCellProps> {
    constructor(props: TableCellProps) {
        super(props);
    }
    render(): React.ReactNode {
        const { node, index } = this.props;

        let content;
        const legendColor = this.props.legendColumnIndex === index ? this.props.legendColors?.[node.id] : undefined;
        if (legendColor) {
            content = createLegendSwatch(legendColor);
        } else if (node.elementIndex && node.elementIndex === index && node.getElement) {
            content = node.getElement();
        } else {
            content = node.getEnrichedContent ? node.getEnrichedContent() : node.labels[index];
        }

        let title = undefined;

        if (node.showTooltip) {
            if (node.tooltips !== undefined) {
                title = node.tooltips[index];
            } else {
                title = node.labels[index];
            }
        }

        return (
            <td key={this.props.index + '-td-' + this.props.node.id}>
                <span title={title}>
                    {this.props.children}
                    {content}
                </span>
            </td>
        );
    }
}
