/***************************************************************************************
 * Copyright (c) 2023, 2025 BlackBerry Limited and others.
 *
 * Licensed under the MIT license. See LICENSE file in the project root for details.
 ***************************************************************************************/
/* eslint-disable @typescript-eslint/ban-types, @typescript-eslint/no-explicit-any */
import React from 'react';
import { ItemPropertiesSignalPayload } from 'traceviewer-base/lib/signals/item-properties-signal-payload';
import { signalManager } from 'traceviewer-base/lib/signals/signal-manager';
import { ReactItemPropertiesWidget } from 'traceviewer-react-components/lib/trace-explorer/trace-explorer-properties-widget';
import 'traceviewer-react-components/style/trace-explorer.css';
import { updateProperties } from 'vscode-trace-common/lib/messages/vscode-messages';
import { messenger } from '.';
import { VsCodeMessageManager } from '../../common/vscode-message-manager';
import '../../style/trace-viewer.css';

interface PropertiesViewState {
    properties: { [key: string]: string };
}

class TraceExplorerProperties extends React.Component<{}, PropertiesViewState> {
    static ID = 'trace-explorer-properties-widget';
    static LABEL = 'Item Properties';
    private _signalHandler: VsCodeMessageManager;

    // VSCODE message handlers
    private _onVscodeUpdateProperties = (data: any): void => {
        if (data?.properties) {
            const payload = new ItemPropertiesSignalPayload(
                data.properties,
                data.experimentUUID,
                data.outputDescriptorId
            );
            signalManager().emit('ITEM_PROPERTIES_UPDATED', payload);
        }
    };

    constructor(props: {}) {
        super(props);
        this.state = {
            properties: {}
        };
        this._signalHandler = new VsCodeMessageManager(messenger);
        messenger.onNotification(updateProperties, this._onVscodeUpdateProperties);
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
        this._signalHandler.sourceLookup(fileLocation, +line);
    }
}

export default TraceExplorerProperties;
