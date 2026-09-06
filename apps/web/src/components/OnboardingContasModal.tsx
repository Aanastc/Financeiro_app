import React, { useState } from "react";
import { financeService } from "../../../../packages/services/finance.service";
import { Building2, CreditCard, Wallet, Plus, Check, X, ChevronLeft, UserPlus } from "lucide-react";
import toast from "react-hot-toast";

interface Props {
  isOpen: boolean;
  userId: string;
  onComplete: () => void;
}

export default function OnboardingContasModal({ isOpen, userId, onComplete }: Props) {
  const [step, setStep] = useState<"intro" | "form" | "success">("intro");
  const [loading, setLoading] = useState(false);
  const [contasAdicionadas, setContasAdicionadas] = useState(0);

  // Form State
  const [nome, setNome] = useState("");
  const [tipo, setTipo] = useState("Conta Corrente");
  const [corHex, setCorHex] = useState("#111827");
  const [temDebito, setTemDebito] = useState(true);

  const [temCredito, setTemCredito] = useState(false);
  const [limite, setLimite] = useState("");
  const [fechamento, setFechamento] = useState("1");
  const [vencimento, setVencimento] = useState("5");

  const [hasDependente, setHasDependente] = useState(false);
  const [dependenteNome, setDependenteNome] = useState("");
  const [dependenteLimite, setDependenteLimite] = useState("");

  if (!isOpen) return null;

  const formatCurrency = (value: string) => {
    const onlyNumbers = value.replace(/\D/g, "");
    if (!onlyNumbers) return "";
    return new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2 }).format(parseFloat(onlyNumbers) / 100);
  };

  const handleSaveConta = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      // 1. Criar a conta bancária
      const contaData = await financeService.addContaBancaria(userId, {
        nome,
        tipo,
        saldo_inicial: 0,
        cor_hex: corHex,
        tem_debito: temDebito,
      });

      const contaId = contaData[0].id;

      // 2. Se tiver cartão de crédito vinculado, cria o cartão
      if (temCredito && limite) {
        const limiteParsed = parseFloat(limite.replace(/\./g, "").replace(",", "."));

        // Cria o cartão principal
        await financeService.addCartao(userId, {
          nome: `${nome} Crédito`,
          limite: limiteParsed,
          fechamento_dia: parseInt(fechamento),
          vencimento_dia: parseInt(vencimento),
          cor_hex: corHex,
          conta_id: contaId,
          dependente_nome: null,
        });

        // Cria o cartão do dependente se solicitado
        if (hasDependente && dependenteNome) {
          const depLimParsed = dependenteLimite ? parseFloat(dependenteLimite.replace(/\./g, "").replace(",", ".")) : limiteParsed;
          await financeService.addCartao(userId, {
            nome: `${nome} Crédito (${dependenteNome})`,
            limite: isNaN(depLimParsed) ? limiteParsed : depLimParsed,
            fechamento_dia: parseInt(fechamento),
            vencimento_dia: parseInt(vencimento),
            cor_hex: corHex,
            conta_id: contaId,
            dependente_nome: dependenteNome,
          });
        }
      }

      toast.success(`${nome} adicionada com sucesso!`);
      setContasAdicionadas((prev) => prev + 1);

      // Resetar formulário
      setNome("");
      setTipo("Conta Corrente");
      setTemDebito(true);
      setTemCredito(false);
      setLimite("");
      setDependenteNome("");
      setDependenteLimite("");
      setStep("success");
    } catch (error: any) {
      toast.error(`Erro ao salvar conta: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 sm:p-6 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white dark:bg-slate-900 rounded-[32px] sm:rounded-[40px] shadow-2xl w-full max-w-xl border border-slate-100 dark:border-slate-800 overflow-hidden flex flex-col max-h-[90vh] relative">

        {/* Botão Fechar Global */}
        <button
          onClick={onComplete}
          className="absolute top-4 right-4 sm:top-6 sm:right-6 p-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500 rounded-full transition-colors z-50"
          title="Fechar e continuar depois"
        >
          <X size={20} />
        </button>

        {step === "intro" && (
          <div className="p-8 sm:p-12 text-center overflow-y-auto mt-4">
            <div className="w-20 h-20 bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 rounded-full flex items-center justify-center mx-auto mb-6">
              <Wallet size={40} />
            </div>
            <h2 className="text-3xl font-black text-slate-800 dark:text-white mb-4">
              Bem-vindo ao Tech Finance!
            </h2>
            <p className="text-slate-500 dark:text-slate-400 mb-8 leading-relaxed">
              Para que o sistema consiga rastrear corretamente para onde vai o seu dinheiro, precisamos cadastrar suas <strong>Contas Bancárias</strong> e <strong>Carteiras</strong>.
            </p>
            <button
              onClick={() => setStep("form")}
              className="w-full bg-indigo-600 hover:bg-indigo-700 text-white p-4 rounded-2xl font-bold transition-all shadow-lg hover:shadow-xl text-lg flex items-center justify-center gap-2 cursor-pointer"
            >
              Cadastrar Minha Primeira Conta
              <Plus size={20} />
            </button>
          </div>
        )}

        {step === "form" && (
          <>
            <div className="px-8 pt-8 pb-4 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-white/80 dark:bg-slate-900/80 sticky top-0 z-10 backdrop-blur-md">
              <div className="flex items-center gap-4">
                <button
                  onClick={() => setStep("intro")}
                  className="p-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500 rounded-xl transition-colors"
                >
                  <ChevronLeft size={20} />
                </button>
                <div>
                  <h2 className="text-xl sm:text-2xl font-black text-slate-800 dark:text-slate-100">
                    Nova Conta
                  </h2>
                  <p className="text-slate-500 text-sm">Contas cadastradas: {contasAdicionadas}</p>
                </div>
              </div>
            </div>

            <div className="p-8 overflow-y-auto custom-scrollbar">
              <form id="conta-form" onSubmit={handleSaveConta} className="space-y-6">
                {/* Dados da Conta */}
                <div className="space-y-4 bg-slate-50 dark:bg-slate-800/50 p-5 rounded-2xl border border-slate-100 dark:border-slate-700/50">
                  <h3 className="font-bold text-slate-700 dark:text-slate-300 flex items-center gap-2">
                    <Building2 size={18} /> Dados da Conta
                  </h3>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs font-bold text-slate-500 uppercase">Nome da Conta (ex: Nubank)</label>
                      <input
                        required
                        type="text"
                        list="bancos-sugestoes"
                        value={nome}
                        onChange={(e) => setNome(e.target.value)}
                        placeholder="Digite ou escolha um banco"
                        className="w-full mt-1 p-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:border-indigo-500 font-bold"
                      />
                      <datalist id="bancos-sugestoes">
                        <option value="Nubank" />
                        <option value="Inter" />
                        <option value="Itaú" />
                        <option value="Bradesco" />
                        <option value="Santander" />
                        <option value="Banco do Brasil" />
                        <option value="Caixa Econômica" />
                        <option value="C6 Bank" />
                        <option value="BTG Pactual" />
                        <option value="XP Investimentos" />
                        <option value="Rico" />
                        <option value="NuInvest" />
                        <option value="PagBank" />
                        <option value="PicPay" />
                        <option value="Mercado Pago" />
                        <option value="Neon" />
                        <option value="Next" />
                        <option value="Sicredi" />
                        <option value="Sicoob" />
                        <option value="Dinheiro Vivo" />
                      </datalist>
                    </div>
                    <div>
                      <label className="text-xs font-bold text-slate-500 uppercase">Tipo</label>
                      <select
                        value={tipo}
                        onChange={(e) => setTipo(e.target.value)}
                        className="w-full mt-1 p-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:border-indigo-500 font-bold"
                      >
                        <option value="Conta Corrente">Conta Corrente</option>
                        <option value="Conta Poupança">Conta Poupança</option>
                        <option value="Carteira">Carteira (Dinheiro Físico)</option>
                        <option value="Outros">Outros</option>
                      </select>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      id="temDebito"
                      checked={temDebito}
                      onChange={(e) => setTemDebito(e.target.checked)}
                      className="w-5 h-5 rounded text-indigo-600 focus:ring-indigo-500 border-slate-300 cursor-pointer"
                    />
                    <label htmlFor="temDebito" className="font-semibold text-slate-700 dark:text-slate-300 cursor-pointer">
                      Possui cartão de Débito?
                    </label>
                  </div>
                </div>

                {/* Cartão de Crédito */}
                <div className="space-y-4 bg-indigo-50 dark:bg-indigo-900/20 p-5 rounded-2xl border border-indigo-100 dark:border-indigo-800/30 transition-all duration-300">
                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      id="temCredito"
                      checked={temCredito}
                      onChange={(e) => setTemCredito(e.target.checked)}
                      className="w-5 h-5 rounded text-indigo-600 focus:ring-indigo-500 border-slate-300 cursor-pointer"
                    />
                    <label htmlFor="temCredito" className="font-bold text-indigo-800 dark:text-indigo-300 flex items-center gap-2 cursor-pointer">
                      <CreditCard size={18} /> Cadastrar Cartão de Crédito
                    </label>
                  </div>

                  {temCredito && (
                    <div className="pt-3 grid grid-cols-1 sm:grid-cols-2 gap-4 animate-in slide-in-from-top-2">
                      <div className="sm:col-span-2">
                        <label className="text-xs font-bold text-indigo-600/70 dark:text-indigo-400/70 uppercase">Limite (R$)</label>
                        <input
                          required={temCredito}
                          type="text"
                          inputMode="numeric"
                          value={limite}
                          onChange={(e) => setLimite(formatCurrency(e.target.value))}
                          placeholder="Ex: 5.000,00"
                          className="w-full mt-1 p-3 bg-white dark:bg-slate-900 border border-indigo-200 dark:border-indigo-800 rounded-xl outline-none focus:border-indigo-500 font-bold"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-bold text-indigo-600/70 dark:text-indigo-400/70 uppercase">Dia Vencimento</label>
                        <input
                          required={temCredito}
                          type="number"
                          min="1" max="31"
                          value={vencimento}
                          onChange={(e) => setVencimento(e.target.value)}
                          className="w-full mt-1 p-3 bg-white dark:bg-slate-900 border border-indigo-200 dark:border-indigo-800 rounded-xl outline-none focus:border-indigo-500 font-bold"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-bold text-indigo-600/70 dark:text-indigo-400/70 uppercase">Dia Fechamento</label>
                        <input
                          required={temCredito}
                          type="number"
                          min="1" max="31"
                          value={fechamento}
                          onChange={(e) => setFechamento(e.target.value)}
                          className="w-full mt-1 p-3 bg-white dark:bg-slate-900 border border-indigo-200 dark:border-indigo-800 rounded-xl outline-none focus:border-indigo-500 font-bold"
                        />
                      </div>
                      <div className="sm:col-span-2 pt-2 border-t border-indigo-200/30 dark:border-indigo-800/30">
                        <label className="flex items-center gap-3 cursor-pointer">
                          <input
                            type="checkbox"
                            className="w-4 h-4 rounded text-indigo-600 border-slate-300 focus:ring-indigo-500"
                            checked={hasDependente}
                            onChange={(e) => setHasDependente(e.target.checked)}
                          />
                          <span className="font-bold text-sm text-indigo-800 dark:text-indigo-300 flex items-center gap-2">
                            <UserPlus size={16} /> Tem um cartão para dependente?
                          </span>
                        </label>

                        {hasDependente && (
                          <div className="mt-4 p-4 bg-white/50 dark:bg-slate-900/50 rounded-2xl border border-indigo-100 dark:border-indigo-800/50 space-y-4 animate-in slide-in-from-top-2">
                            <div className="space-y-1.5">
                              <label className="text-[10px] font-black text-indigo-600 dark:text-indigo-400 uppercase ml-2 tracking-wider">
                                Nome do Dependente
                              </label>
                              <input
                                placeholder="Ex: João, Maria..."
                                className="w-full p-3 bg-white dark:bg-slate-900 border border-indigo-200 dark:border-indigo-800 rounded-xl outline-none focus:border-indigo-500 font-bold"
                                value={dependenteNome}
                                onChange={(e) => setDependenteNome(e.target.value)}
                              />
                            </div>
                            <div className="space-y-1.5">
                              <label className="text-[10px] font-black text-indigo-600 dark:text-indigo-400 uppercase ml-2 tracking-wider">
                                Limite Específico (Opcional)
                              </label>
                              <input
                                type="text"
                                inputMode="numeric"
                                placeholder="R$ (Mesmo limite se vazio)"
                                className="w-full p-3 bg-white dark:bg-slate-900 border border-indigo-200 dark:border-indigo-800 rounded-xl outline-none focus:border-indigo-500 font-bold text-emerald-600 dark:text-emerald-450"
                                value={dependenteLimite}
                                onChange={(e) => setDependenteLimite(formatCurrency(e.target.value))}
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </form>
            </div>

            <div className="p-6 bg-slate-50 dark:bg-slate-800/30 border-t border-slate-100 dark:border-slate-800 flex justify-end gap-3 sticky bottom-0">
              <button
                type="submit"
                form="conta-form"
                disabled={loading}
                className="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold transition-all disabled:opacity-50 flex items-center gap-2 shadow-lg cursor-pointer"
              >
                {loading ? "Salvando..." : "Salvar Conta"}
              </button>
            </div>
          </>
        )}

        {step === "success" && (
          <div className="p-10 text-center">
            <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-6">
              <Check size={32} strokeWidth={3} />
            </div>
            <h2 className="text-2xl font-black text-slate-800 dark:text-white mb-2">Conta salva com sucesso!</h2>
            <p className="text-slate-500 mb-8">Deseja adicionar outra conta bancária?</p>

            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <button
                onClick={() => setStep("form")}
                className="px-6 py-3 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-400 dark:hover:bg-indigo-500/20 rounded-xl font-bold transition-all cursor-pointer"
              >
                Adicionar Outra Conta
              </button>
              <button
                onClick={() => {
                  if (contasAdicionadas > 0) {
                    onComplete();
                  }
                }}
                className="px-6 py-3 bg-[#4CAF50] hover:bg-[#43a047] text-white rounded-xl font-bold transition-all shadow-lg shadow-emerald-100 dark:shadow-none cursor-pointer"
              >
                Concluir e Acessar Painel
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
