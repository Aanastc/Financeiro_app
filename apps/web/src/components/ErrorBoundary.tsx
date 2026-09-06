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
        <div className="min-h-screen bg-slate-50 p-8 flex flex-col items-center justify-center font-sans text-slate-800">
          <div className="bg-white p-8 rounded-2xl shadow-xl max-w-2xl w-full border border-red-200">
            <h1 className="text-2xl font-black text-red-600 mb-4">Ops! Ocorreu um erro na interface.</h1>
            <p className="text-slate-600 mb-4">Para me ajudar a corrigir isso, por favor tire um print dessa tela e me envie.</p>
            
            <div className="bg-slate-100 p-4 rounded-lg overflow-x-auto mb-4">
              <h2 className="font-bold text-slate-700 text-sm mb-2">Mensagem do Erro:</h2>
              <pre className="text-xs text-red-500 font-mono">
                {this.state.error?.toString()}
              </pre>
            </div>

            <div className="bg-slate-100 p-4 rounded-lg overflow-x-auto">
              <h2 className="font-bold text-slate-700 text-sm mb-2">Pilha de Componentes (Onde quebrou):</h2>
              <pre className="text-[10px] text-slate-600 font-mono whitespace-pre-wrap">
                {this.state.errorInfo?.componentStack}
              </pre>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 mt-6">
              <button 
                onClick={() => window.location.reload()} 
                className="px-6 py-3 bg-slate-200 text-slate-700 font-bold rounded-xl hover:bg-slate-300 transition-colors flex-1"
              >
                Recarregar a página
              </button>
              
              <a 
                href={`mailto:analeticia_ac@outlook.com?subject=Relatório%20de%20Erro%20-%20Tech%20Finance&body=${encodeURIComponent("Olá, encontrei o seguinte erro na aplicação:\n\n" + (this.state.error?.toString() || "") + "\n\nPilha de Componentes:\n" + (this.state.errorInfo?.componentStack || ""))}`}
                className="px-6 py-3 bg-red-600 text-white font-bold rounded-xl hover:bg-red-700 transition-colors flex-1 text-center shadow-lg shadow-red-200 flex items-center justify-center gap-2"
              >
                Enviar erro para o suporte
              </a>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
