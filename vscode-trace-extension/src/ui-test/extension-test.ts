import { ActivityBar, By, InputBox, VSBrowser, WebDriver } from 'vscode-extension-tester';
import assert from 'assert';

describe('VSCode Trace Extension UI Tests', () => {
    let driver: WebDriver;

    before(() => {
        driver = VSBrowser.instance.driver;
    });

    it('Open Trace from Explorer', async () => {
        const activityBar = new ActivityBar();
        const explorerControl = await activityBar.getViewControl('Explorer');
        assert(explorerControl);
        const explorerView = await explorerControl.openView();
        const explorerContent = explorerView.getContent();
        const noFolderOpenedSection = await explorerContent.getSection('No Folder Opened');
        const button = await noFolderOpenedSection.findElement(By.className('monaco-button'));
        await button.click();
        const input = await InputBox.create();
        await input.setText('/tmp/foo');
        await input.confirm();
        await sleep(1000);
        await input.cancel();
    }).timeout(60000);

    it('Open Trace from Trace Viewer', async () => {
        const activityBar = new ActivityBar();
        const traceViewerControl = await activityBar.getViewControl('Trace Viewer');
        assert(traceViewerControl);
        const traceViewerView = await traceViewerControl.openView();
        const traceViewerContent = traceViewerView.getContent();
        const openedTracesSection = await traceViewerContent.getSection('Opened Traces');
        await openedTracesSection.expand();
        const actions = driver.actions();
        const openTraceAction = await openedTracesSection.getAction('Open Trace');
        assert(openTraceAction);
        const rect = await openedTracesSection.getRect();
        const location = { x: rect.x, y: rect.y, duration: 0 };
        actions.move( location ).perform();
        await sleep(0);
        openTraceAction.click();
        const input = await InputBox.create();
        await input.setText('/tmp/bar');
        await input.confirm();
        await sleep(1000);
        await input.cancel();
    }).timeout(60000);

});

function sleep(ms: number): Promise<void> {
    return new Promise(resolve => {
        setTimeout(resolve, ms);
    });
}
