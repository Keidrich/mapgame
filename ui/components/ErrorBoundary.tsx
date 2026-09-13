import { Component, type ErrorInfo, type ReactNode } from 'react';

/**
 * A crash used to take everything with it. One throw while rendering a sheet unmounted the
 * whole app and left a black page — the save intact in IndexedDB, and no way back to it.
 *
 * Anything that throws below this boundary is caught, named, and recoverable: the rest of
 * the game keeps running, and the panel that broke is the only thing that goes. The world
 * itself is never touched by a render, so closing the panel really does get you back.
 */
interface Props { children: ReactNode; what: string; onReset?: () => void; resetLabel?: string }
interface State { error: Error | null }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State { return { error }; }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // the console is the only place a player can copy a stack from, so give them a real one
    console.error(`RACKETS: crash in ${this.props.what}`, error, info.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    const back = () => { this.setState({ error: null }); this.props.onReset?.(); };
    return (
      <div className="card mt12" style={{ borderColor: 'var(--red)' }} role="alert">
        <b className="red">Something broke in {this.props.what}.</b>
        <p className="small muted mt8" style={{ margin: '8px 0 0' }}>
          Your game is safe — it is saved and nothing here changed it. Go back and carry on; if it keeps
          happening, avoid that panel and send this line along: <code className="small">{error.message}</code>
        </p>
        <div className="row mt8" style={{ gap: 8 }}>
          {this.props.onReset && <button type="button" className="btn btn-primary grow" onClick={back}>{this.props.resetLabel ?? 'Back to the game'}</button>}
          <button type="button" className="btn btn-ghost" onClick={() => window.location.reload()}>Reload</button>
        </div>
      </div>
    );
  }
}
