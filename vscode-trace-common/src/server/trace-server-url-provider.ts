export class TraceServerUrlProvider {
    private onDidChangeConfigurationHandlers: ((url: string) => void)[] = [];

    public updateTraceServerUrl = (newUrl: string): void =>  {
        this.onDidChangeConfigurationHandlers.forEach(handler => {
            handler(newUrl);
        });
    };

    public onTraceServerUrlChange(handler: ((url: string) => void)): void{
        this.onDidChangeConfigurationHandlers.push(handler);
    }
}
