/* eslint-disable @typescript-eslint/no-explicit-any */
import { AbstractOutputComponent, AbstractOutputProps, AbstractOutputState } from './abstract-output-component';
import * as React from 'react';
import { QueryHelper } from 'tsp-typescript-client/lib/models/query/query-helper';
import { ResponseStatus } from 'tsp-typescript-client/lib/models/response/responses';
import { ObjectModel } from 'tsp-typescript-client/lib/models/object';
import { isEmpty } from 'lodash';
import { JSONBigUtils } from 'tsp-typescript-client/lib/utils/jsonbig-utils';
import { JsonEditor } from 'json-edit-react';
import debounce from 'lodash.debounce';
import '../../style/react-contextify.css';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faSpinner } from '@fortawesome/free-solid-svg-icons';

type DataOutputProps = AbstractOutputProps & {};

type DataOuputState = AbstractOutputState & {
    model: ObjectModel
};

const MENU_ID = 'Data.context.menuId ';

export class DataOutputComponent extends AbstractOutputComponent<AbstractOutputProps, DataOuputState> {
    dataRef: React.RefObject<HTMLDivElement> = React.createRef();

    private _debouncedFetchData = debounce(() => this.fetchData(), 500);

    constructor(props: AbstractOutputProps) {
        super(props);
        this.state = {
            outputStatus: ResponseStatus.RUNNING,
            model: { object: {} },
        };
        this.addPinViewOptions();
    }

    componentDidMount(): void {
        this.waitAnalysisCompletion();
    }

    async fetchData(navObject?: { [key: string]: any }, scroll?: () => void): Promise<ResponseStatus> {
        const useSelectionRange = this.props.outputDescriptor.capabilities?.selectionRange;
        const parameters = useSelectionRange && this.props.selectionRange
            ? QueryHelper.query({ ...navObject, 'count' : 500, 'selection_range' : { 'start': this.props.selectionRange.getStart(), 'end': this.props.selectionRange.getEnd() } } )
            : QueryHelper.query({ ...navObject, 'count' : 500 });
        const tspClientResponse = await this.props.tspClient.fetchObject(
            this.props.traceId,
            this.props.outputDescriptor.id,
            parameters
        );
        const modelResponse = tspClientResponse.getModel();
        if (tspClientResponse.isOk() && modelResponse) {
            if (modelResponse.model) {
                this.setState({
                    outputStatus: modelResponse.status,
                    model: modelResponse.model
                }, scroll);
            } else {
                this.setState({
                    outputStatus: modelResponse.status
                });
            }
            return modelResponse.status;
        }
        this.setState({
            outputStatus: ResponseStatus.FAILED
        });
        return ResponseStatus.FAILED;
    }

    resultsAreEmpty(): boolean {
        return isEmpty(this.state.model);
    }

    renderMainArea(): React.ReactNode {
        return (
            <React.Fragment>
                {this.state.outputStatus === ResponseStatus.COMPLETED ? (
                    <div>
                        <div
                            ref={this.dataRef}
                            className="data-output-main-area"
                            style={{
                                height: this.props.style.height,
                                width: this.props.outputWidth - this.getHandleWidth()
                            }}
                        >
                            {this.renderPrevButton()}
                            {this.renderObject()}
                            {this.renderNextButton()}
                        </div>
                    </div>
                ) : (
                    <div
                        tabIndex={0}
                        id={this.props.traceId + this.props.outputDescriptor.id + 'focusContainer'}
                        className="analysis-running-main-area"
                    >
                        <FontAwesomeIcon icon={faSpinner} spin style={{ marginRight: '5px' }} />
                        <span>Analysis running</span>
                    </div>
                )}
            </React.Fragment>
        );
    }

    private renderObject() {
        const replacer = (_key: any, value: any) => {
             return (typeof value === 'bigint') ? value.toString() + 'n' : value;
        };
        const obj = JSON.parse(JSONBigUtils.stringify(this.state.model.object, null, '\t'));
        return (
            <JsonEditor
                data={ obj }
                restrictEdit={ true }
                showArrayIndices={ true }
                collapse={ 2 }
                rootName=''
                rootFontSize={ '10px' }
                minWidth={ '95%' }
                
            />
        );
    }
    private renderPrevButton() {
        const navObject = { previous: this.state.model.previous };
        const scroll = () => this.dataRef.current?.scrollTo({ top: this.dataRef.current.scrollHeight, left: 0 });
        return (
            <React.Fragment>
                {navObject.previous != undefined ? (
                    <div><button onClick={() => this.fetchData(navObject, scroll)}>Previous</button><br></br></div>
                ) : (
                    <></>
                )}
            </React.Fragment>
        );
    }

    private renderNextButton() {
        const navObject = { next: this.state.model.next };
        const scroll = () => this.dataRef.current?.scrollTo({ top: 0, left: 0 });
        return (
            <React.Fragment>
                {navObject.next != undefined ? (
                    <div><br></br><button onClick={() => this.fetchData(navObject, scroll)}>Next</button></div>
                ) : (
                    <></>
                )}
            </React.Fragment>
        );
    }

    setFocus(): void {
        if (document.getElementById(this.props.traceId + this.props.outputDescriptor.id + 'focusContainer')) {
            document.getElementById(this.props.traceId + this.props.outputDescriptor.id + 'focusContainer')?.focus();
        } else {
            document.getElementById(this.props.traceId + this.props.outputDescriptor.id)?.focus();
        }
    }

    protected async waitAnalysisCompletion(): Promise<void> {
        let outputStatus = this.state.outputStatus;
        const timeout = 500;
        while (this.state && outputStatus === ResponseStatus.RUNNING) {
            outputStatus = await this.fetchData();
            await new Promise(resolve => setTimeout(resolve, timeout));
        }
    }

    componentWillUnmount(): void {
        // fix Warning: Can't perform a React state update on an unmounted component
        this.setState = (_state, _callback) => undefined;
    }

    async componentDidUpdate(prevProps: DataOutputProps): Promise<void> {
        if (this.props.selectionRange && this.props.selectionRange !== prevProps.selectionRange) {
            this._debouncedFetchData();
        }
    }
}
