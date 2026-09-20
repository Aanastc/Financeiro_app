import React, { Component, ErrorInfo, ReactNode } from "react";

interface Props {
  children?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
    this.setState({
      error,
      errorInfo
    });
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-50 dark:bg-slate-950 p-6 flex flex-col items-center justify-center font-sans text-slate-800 dark:text-slate-100">
          <div className="bg-white dark:bg-slate-900 p-8 sm:p-10 rounded-[32px] shadow-xl max-w-lg w-full border border-slate-200 dark:border-slate-800 text-center">
            <div className="w-16 h-16 bg-red-100 dark:bg-red-950/50 text-red-500 rounded-2xl flex items-center justify-center mx-auto mb-6">
              <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>

            <h1 className="text-2xl font-black text-slate-800 dark:text-slate-100 mb-2">Ops! Algo deu errado</h1>
            <p className="text-slate-500 dark:text-slate-400 text-sm mb-8 leading-relaxed">
              Ocorreu uma instabilidade inesperada na interface. Os detalhes técnicos foram registrados no console. Você pode tentar recarregar ou avisar o suporte.
            </p>

            <div className="flex flex-col sm:flex-row gap-3">
              <button 
                onClick={() => window.location.reload()} 
                className="px-6 py-3.5 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-bold rounded-2xl hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors flex-1 text-sm cursor-pointer"
              >
                Recarregar a página
              </button>
              
              <a 
                href={`mailto:analeticia_ac@outlook.com?subject=Relatório%20de%20Erro%20-%20Tech%20Finance&body=${encodeURIComponent("Olá, encontrei o seguinte erro na aplicação:\n\n" + (this.state.error?.toString() || "") + "\n\nPilha:\n" + (this.state.errorInfo?.componentStack || ""))}`}
                className="px-6 py-3.5 bg-red-600 text-white font-bold rounded-2xl hover:bg-red-700 transition-colors flex-1 text-center shadow-lg shadow-red-500/20 text-sm flex items-center justify-center cursor-pointer"
              >
                Enviar para o suporte
              </a>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
