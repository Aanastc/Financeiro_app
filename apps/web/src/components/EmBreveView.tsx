import React from "react";
import { motion } from "framer-motion";
import { Clock, Sparkles, ArrowLeft, ShieldCheck, Zap, Rocket } from "lucide-react";
import { useNavigate } from "react-router-dom";

interface EmBreveViewProps {
  modulo: "SPLITWISE" | "PJ";
  onVoltarPessoal?: () => void;
}

export default function EmBreveView({ modulo, onVoltarPessoal }: EmBreveViewProps) {
  const navigate = useNavigate();

  const isPj = modulo === "PJ";

  const config = isPj
    ? {
        tag: "Módulo Corporativo",
        titulo: "Finanças PJ & MEI",
        subtitulo: "Estamos finalizando o motor contábil e de conciliação fiscal.",
        descricao:
          "Em breve você terá controle total de faturamento anual do MEI, acompanhamento automático do teto de R$ 81.000, emissão de alertas da guia DAS e separação rigorosa entre dinheiro pessoal e da empresa.",
        gradiente: "from-emerald-600 via-teal-600 to-indigo-700",
        badgeCor: "bg-emerald-500/20 text-emerald-300 border-emerald-400/30",
        recursos: [
          "Termômetro de limite anual MEI com cálculo diário",
          "Separação automática de despesas operacionais da empresa",
          "Gestão de impostos e lembretes da guia DAS",
          "Relatórios de faturamento prontos para a Declaração Anual"
        ]
      }
    : {
        tag: "Finanças Compartilhadas",
        titulo: "Splitwise & Divisão de Contas",
        subtitulo: "A lógica de conciliação entre amigos está em fase final de testes.",
        descricao:
          "Em breve você poderá dividir contas de bares, viagens e despesas de moradia sem dor de cabeça, com links dinâmicos de cobrança via Pix e sincronização inteligente para quem deve a quem.",
        gradiente: "from-violet-600 via-purple-600 to-indigo-700",
        badgeCor: "bg-purple-500/20 text-purple-300 border-purple-400/30",
        recursos: [
          "Divisão justa e proporcional de despesas em grupo",
          "Cobrança elegante via WhatsApp com chave Pix embutida",
          "Assistente de Acordos com IA para conciliação amigável",
          "Histórico de pagamentos e quitações parciais em tempo real"
        ]
      };

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="space-y-6 max-w-4xl mx-auto py-4"
    >
      {/* HERO BANNER EM BREVE */}
      <div
        className={`bg-gradient-to-r ${config.gradiente} rounded-3xl p-6 sm:p-10 text-white shadow-xl relative overflow-hidden`}
      >
        {/* Efeito de luz decorativo */}
        <div className="absolute -right-10 -bottom-10 w-64 h-64 bg-white/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute top-0 right-1/4 w-40 h-40 bg-white/5 rounded-full blur-2xl pointer-events-none" />

        <div className="relative z-10 space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider border backdrop-blur-md ${config.badgeCor}`}
            >
              <Clock size={13} className="animate-pulse" /> Em Breve
            </span>
            <span className="text-white/80 text-xs font-bold px-2 py-0.5 rounded-full bg-white/10 backdrop-blur-xs">
              {config.tag}
            </span>
          </div>

          <h2 className="text-3xl sm:text-4xl font-black tracking-tight">{config.titulo}</h2>
          <p className="text-lg font-medium text-white/90 max-w-2xl">{config.subtitulo}</p>
          <p className="text-sm text-white/75 max-w-2xl leading-relaxed">{config.descricao}</p>
        </div>
      </div>

      {/* CARD DE DETALHES & ROADMAP */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-6 sm:p-8 shadow-sm space-y-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
            <Sparkles size={20} />
          </div>
          <div>
            <h3 className="text-lg font-black text-slate-800 dark:text-slate-100">
              O que está chegando neste módulo
            </h3>
            <p className="text-xs font-medium text-slate-400">
              Recursos planejados para a versão Web e Mobile
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
          {config.recursos.map((rec, idx) => (
            <div
              key={idx}
              className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 flex items-start gap-3"
            >
              <div className="w-6 h-6 rounded-lg bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0 mt-0.5">
                <Rocket size={13} />
              </div>
              <p className="text-xs font-bold text-slate-700 dark:text-slate-300 leading-relaxed">
                {rec}
              </p>
            </div>
          ))}
        </div>

        <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
            <ShieldCheck size={16} className="text-indigo-500" />
            <span>Compatibilidade garantida com a arquitetura do app Mobile.</span>
          </div>

          <button
            onClick={() => {
              if (onVoltarPessoal) onVoltarPessoal();
              else navigate("/home?tab=pessoal");
            }}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 hover:opacity-90 transition-all cursor-pointer shadow-sm"
          >
            <ArrowLeft size={16} /> Voltar ao Painel Pessoal
          </button>
        </div>
      </div>
    </motion.div>
  );
}
