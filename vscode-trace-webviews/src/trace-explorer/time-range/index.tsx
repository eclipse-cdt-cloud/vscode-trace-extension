import * as React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import TimeRangeDataWidget from './vscode-time-range-data-widget';

const root = ReactDOM.createRoot(document.getElementById('root') as HTMLElement);
root.render(
    <TimeRangeDataWidget/>
);
