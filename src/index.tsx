import * as React from 'react';
import * as ReactDOM from 'react-dom';
import TraceViewerContainer from './trace-viewer-container';
import './index.css';

ReactDOM.render(
  <TraceViewerContainer />,
  (document.getElementById('root') as HTMLElement)
);
