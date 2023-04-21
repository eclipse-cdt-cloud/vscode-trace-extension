/***************************************************************************************
 * Copyright (c) 2023 BlackBerry Limited and others.
 *
 * Licensed under the MIT license. See LICENSE file in the project root for details.
 ***************************************************************************************/

import * as vscode from 'vscode';

export class TraceExtensionLogger {
    private logChannel: vscode.OutputChannel;
    private channelDisposed = true;

    constructor(logChannelName: string) {
        this.logChannel = vscode.window.createOutputChannel(logChannelName);
        this.channelDisposed = false;
    }

    /**
     * Returns the status of the log output channel
     *
     * @returns true if the current channel has been disposed, false otherwise
     */
    isCurrentChannelDisposed(): boolean {
        return this.channelDisposed;
    }

    /**
     * Show the log channel from the UI
     */
    showLog(): void {
        if (!this.isCurrentChannelDisposed()) {
            this.logChannel.show();
        }
    }

    /**
     * Hide the log channel from the UI
     */
    hideLog(): void {
        if (!this.isCurrentChannelDisposed()) {
            this.logChannel.hide();
        }
    }

    /**
     * Clears the entries from the log channel
     */
    clearLog(): void {
        if (!this.isCurrentChannelDisposed()) {
            this.logChannel.clear();
        }
    }

    /**
     * Disposes the log channel and all of its resources
     */
    disposeChannel(): void {
        if (!this.isCurrentChannelDisposed()) {
            this.logChannel.dispose();
            this.channelDisposed = true;
        }
    }

    /**
     * Adds a log entry to the log channel with an optional tag
     *
     * @param message message to be appended to the log channel
     * @param tag appended to the front of the message (i.e. [$tag] $message)
     */
    addLogMessage(message: string, tag?: string): void {
        let fullMessage: string;
        if (tag) {
            fullMessage = '[' + tag + '] ' + message;
        } else {
            fullMessage = message;
        }
        this.addLogPanelMessage(fullMessage);
    }

    /**
     * Adds a log entry for an error.
     * Prints the error message and the stack
     *
     * @param e error to be appended to the log channel
     */
    logError(e: Error): void {
        this.addLogMessage(e.message);
        if (e.stack) {
            this.addLogMessage(e.stack);
        }
    }

    /**
     * Shows an information message to user as a notification and
     * adds the message to the log channel
     *
     * @param message information message to show to the user and add to the log channel
     * @param options Configures the behavior of the message
     * @returns void promise
     */
    async showInfo(message: string, options?: vscode.MessageOptions): Promise<void> {
        const fullMessage = 'Info: ' + message;
        vscode.window.showInformationMessage(fullMessage, options || { modal: false });
        return this.addLogMessage(fullMessage);
    }

    /**
     * Shows a warning message to user as a notification and
     * adds the message to the log channel
     *
     * @param message warning message to show to the user and add to the log channel
     * @param options Configures the behavior of the message
     * @returns void promise
     */
    async showWarning(message: string, options?: vscode.MessageOptions): Promise<void> {
        const fullMessage = 'Warning: ' + message;
        vscode.window.showWarningMessage(fullMessage, options || { modal: false });
        return this.addLogMessage(fullMessage);
    }

    /**
     * Shows an error message to user as a notification and
     * adds the message to the log channel
     *
     * @param message error message to show to the user and add to the log channel
     * @param options Configures the behavior of the message
     * @returns void promise
     */
    async showError(message: string, options?: vscode.MessageOptions): Promise<void> {
        const fullMessage = 'Error: ' + message;
        vscode.window.showErrorMessage(fullMessage, options || { modal: false });
        return this.addLogMessage(fullMessage);
    }

    /**
     * Appends the message with a timestamp to the log channel
     *
     * @param message message to be added to the log channel
     */
    private addLogPanelMessage(message: string) {
        if (!this.isCurrentChannelDisposed()) {
            this.logChannel.append(`[${this.getTimestamp()}] ${message}\n`);
        }
    }

    /**
     * Gets the current formatted timestamp
     *
     * @returns formatted timestamp
     */
    private getTimestamp(): string {
        const date = new Date();
        return (
            date.getFullYear() +
            '-' +
            this.padTwoDigits(date.getMonth() + 1) +
            '-' +
            this.padTwoDigits(date.getDate()) +
            ' ' +
            this.padTwoDigits(date.getHours()) +
            ':' +
            this.padTwoDigits(date.getMinutes()) +
            ':' +
            this.padTwoDigits(date.getSeconds()) +
            '.' +
            this.padThreeDigits(date.getMilliseconds())
        );
    }

    /**
     * Pad a number with a leading zero if it is less than two digits long.
     *
     * @param n Number to be padded
     * @returns Number that is padded with leading zeros
     */
    private padTwoDigits(n: number): string {
        return (n > 9 ? '' : '0') + n;
    }

    /**
     * If a number is less than three digits, the number will be padded with leading zeros
     *
     * @param n Number to be padded
     * @returns Number that is padded with leading zeros
     */
    private padThreeDigits(n: number): string {
        return (n > 99 ? '' : n > 9 ? '0' : '00') + n;
    }
}
