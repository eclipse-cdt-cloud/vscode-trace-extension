/***************************************************************************************
 * Copyright (c) 2023 BlackBerry Limited and others.
 *
 * Licensed under the MIT license. See LICENSE file in the project root for details.
 ***************************************************************************************/
/* eslint-disable @typescript-eslint/ban-types */
import React from 'react';
import { VsCodeMessageManager } from 'vscode-trace-common/lib/messages/vscode-message-manager';
import { ReactItemPropertiesWidget } from 'traceviewer-react-components/lib/trace-explorer/trace-explorer-properties-widget';
import { signalManager } from 'traceviewer-base/lib/signals/signal-manager';

interface PropertiesViewState {
    properties: { [key: string]: string };
}

class TraceExplorerProperties extends React.Component<{}, PropertiesViewState> {
    static ID = 'trace-explorer-properties-widget';
    static LABEL = 'Item Properties';
    private _signalHandler: VsCodeMessageManager;

    constructor(props: {}) {
        super(props);
        this.state = {
            properties: {}
        };
        this._signalHandler = new VsCodeMessageManager();

        window.addEventListener('message', event => {
            const message = event.data; // The JSON data our extension sent
            switch (message.command) {
                case 'receivedProperties':
                    signalManager().fireItemPropertiesSignalUpdated(message.data.properties);
                    break;
            }
        });
    }

    componentDidMount(): void {
        this._signalHandler.notifyReady();
    }

    public render(): React.ReactNode {
        return (
            <div>
                <ReactItemPropertiesWidget
                    id={TraceExplorerProperties.ID}
                    title={TraceExplorerProperties.LABEL}
                    handleSourcecodeLookup={this.handleSourcecodeLookup}
                ></ReactItemPropertiesWidget>
            </div>
        );
    }

    protected handleSourcecodeLookup = (e: React.MouseEvent<HTMLParagraphElement>): void =>
        this.doHandleSourcecodeLookup(e);

    private doHandleSourcecodeLookup(e: React.MouseEvent<HTMLParagraphElement>) {
        const { fileLocation, line }: { fileLocation: string; line: string } = JSON.parse(
            `${e.currentTarget.getAttribute('data-id')}`
        );
        console.log('filename: ' + fileLocation + ':' + line);
        console.log('Source lookup method not implemented');
    }
}

export default TraceExplorerProperties;
