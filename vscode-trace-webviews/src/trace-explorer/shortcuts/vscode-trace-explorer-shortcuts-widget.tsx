/* eslint-disable @typescript-eslint/ban-types */
import React from 'react';
import { KeyboardShortcutsComponent } from 'traceviewer-react-components/lib/trace-explorer/trace-explorer-sub-widgets/keyboard-shortcuts-component';
import 'traceviewer-react-components/style/trace-explorer.css';
import '../../style/trace-viewer.css';

class ChartShortcutsComponent extends React.Component<{}, {}> {
    constructor(props: {}) {
        super(props);
    }

    public render(): React.ReactNode {
        return (
            <div className="componentBody">
                <KeyboardShortcutsComponent />
            </div>
        );
    }
}

export default ChartShortcutsComponent;
