import { useState, useEffect } from "react";
import { X, Users, Home, Heart, Plane, Beer,  Check,   UserPlus } from "lucide-react";
import { despesasCompartilhadasService } from "../../../../packages/services/despesas-compartilhadas.service";
import toast from "react-hot-toast";

interface CriarGrupoModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (grupoCriado: any) => void;
  userId: string;
  userName: string;
  contatosDisponiveis: any[];
}

const TIPOS_GRUPO = [
  { id: "viagem", label: "Viagem", icon: Plane, cor: "#3b82f6" },
  { id: "casa", label: "Casa / Apê", icon: Home, cor: "#10b981" },
  { id: "casal", label: "Casal", icon: Heart, cor: "#ec4899" },
  { id: "role", label: "Rolê / Evento", icon: Beer, cor: "#f59e0b" },
  { id: "outro", label: "Geral / Outro", icon: Users, cor: "#8b5cf6" }
];

const CORES_PALETA = [
  "#8b5cf6", // Roxo
  "#3b82f6", // Azul
  "#10b981", // Verde
  "#ec4899", // Rosa
  "#f59e0b", // Laranja
  "#06b6d4", // Ciano
  "#ef4444"  // Vermelho
];

export default function CriarGrupoModal({
  isOpen,
  onClose,
  onSuccess,
  userId,
  userName,
  contatosDisponiveis
}: CriarGrupoModalProps) {
  const [nome, setNome] = useState("");
  const [tipo, setTipo] = useState<"viagem" | "casa" | "casal" | "role" | "outro">("viagem");
  const [corHex, setCorHex] = useState("#8b5cf6");
  const [descricao, setDescricao] = useState("");
  const [membrosSelecionados, setMembrosSelecionados] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  // Formulário rápido para novo membro avulso
  const [isAddingNovoAmigo, setIsAddingNovoAmigo] = useState(false);
  const [novoAmigoNome, setNovoAmigoNome] = useState("");
  const [novoAmigoEmail, setNovoAmigoEmail] = useState("");
  const [novoAmigoTelefone, setNovoAmigoTelefone] = useState("");

  useEffect(() => {
    if (isOpen) {
      setNome("");
      setTipo("viagem");
      setCorHex("#8b5cf6");
      setDescricao("");
      // Inclui o próprio usuário logado por padrão
      setMembrosSelecionados([
        {
          id: userId,
          nome: userName || "Você",
          is_user: true
        }
      ]);
    }
  }, [isOpen, userId, userName]);

  if (!isOpen) return null;

  const toggleContato = (contato: any) => {
    const jaExiste = membrosSelecionados.some(m => m.contato_id === contato.id);
    if (jaExiste) {
      setMembrosSelecionados(membrosSelecionados.filter(m => m.contato_id !== contato.id));
    } else {
      setMembrosSelecionados([
        ...membrosSelecionados,
        {
          contato_id: contato.id,
          nome: contato.nome,
          email: contato.email || null,
          telefone: contato.telefone || null,
          is_user: false
        }
      ]);
    }
  };

  const handleAddNovoAmigo = () => {
    if (!novoAmigoNome.trim()) {
      toast.error("Informe o nome do amigo");
      return;
    }

    setMembrosSelecionados([
      ...membrosSelecionados,
      {
        nome: novoAmigoNome.trim(),
        email: novoAmigoEmail.trim() || null,
        telefone: novoAmigoTelefone.trim() || null,
        is_user: false
      }
    ]);

    setNovoAmigoNome("");
    setNovoAmigoEmail("");
    setNovoAmigoTelefone("");
    setIsAddingNovoAmigo(false);
  };

  const removerMembro = (index: number) => {
    if (index === 0) {
      toast.error("Você deve fazer parte do grupo!");
      return;
    }
    const copia = [...membrosSelecionados];
    copia.splice(index, 1);
    setMembrosSelecionados(copia);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nome.trim()) {
      toast.error("Informe o nome do grupo");
      return;
    }
    if (membrosSelecionados.length < 2) {
      toast.error("Adicione pelo menos mais 1 pessoa para formar o grupo!");
      return;
    }

    setLoading(true);
    try {
      const tipoObj = TIPOS_GRUPO.find(t => t.id === tipo);
      const novoGrupo = await despesasCompartilhadasService.criarGrupo(
        userId,
        {
          nome: nome.trim(),
          tipo,
          descricao: descricao.trim() || undefined,
          cor_hex: corHex,
          icone: tipoObj ? tipoObj.id : "Users"
        },
        membrosSelecionados
      );

      toast.success(`Grupo "${novoGrupo.nome}" criado com sucesso!`);
      onSuccess(novoGrupo);
      onClose();
    } catch (err: any) {
      console.error(err);
      toast.error("Erro ao criar grupo: " + (err.message || "Erro desconhecido"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[110] flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="bg-white dark:bg-slate-900 rounded-[32px] w-full max-w-xl overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-200 border border-slate-100 dark:border-slate-800 flex flex-col max-h-[95vh]">
        {/* HEADER */}
        <div 
          className="p-6 text-white flex justify-between items-center shrink-0 transition-colors duration-300"
          style={{ backgroundColor: corHex }}
        >
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center backdrop-blur-xs">
              <Users size={24} className="text-white" />
            </div>
            <div>
              <h2 className="text-xl font-black">Criar Novo Grupo</h2>
              <p className="text-white/80 text-xs font-semibold">Organize a divisão de despesas do grupo</p>
            </div>
          </div>
          <button 
            type="button" 
            onClick={onClose} 
            className="p-2 text-white/80 hover:text-white hover:bg-white/10 rounded-full transition-colors cursor-pointer"
          >
            <X size={20} />
          </button>
        </div>

        {/* FORM */}
        <form onSubmit={handleSubmit} className="p-6 space-y-6 overflow-y-auto flex-1 scrollbar-thin">
          {/* Nome do Grupo */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-black uppercase tracking-wider text-slate-400 dark:text-slate-500 ml-1">
              Nome do Grupo *
            </label>
            <input
              type="text"
              required
              value={nome}
              onChange={e => setNome(e.target.value)}
              placeholder="Ex: Viagem Ubatuba, Churrasco de Domingo, Apê 304..."
              className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl px-4 py-3 text-sm font-bold text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
          </div>

          {/* Tipo de Grupo */}
          <div className="space-y-2">
            <label className="text-[10px] font-black uppercase tracking-wider text-slate-400 dark:text-slate-500 ml-1">
              Tipo de Despesa Compartilhada
            </label>
            <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
              {TIPOS_GRUPO.map(t => {
                const IconComponent = t.icon;
                const isSelected = tipo === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => {
                      setTipo(t.id as any);
                      setCorHex(t.cor);
                    }}
                    className={`flex flex-col items-center justify-center gap-1.5 p-3 rounded-2xl border transition-all cursor-pointer ${
                      isSelected
                        ? "border-purple-500 bg-purple-50/50 dark:bg-purple-950/20 text-purple-600 dark:text-purple-400 font-black shadow-xs ring-2 ring-purple-400/30"
                        : "border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:border-slate-300"
                    }`}
                  >
                    <IconComponent size={20} />
                    <span className="text-[11px] truncate">{t.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Paleta de Cores */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-black uppercase tracking-wider text-slate-400 dark:text-slate-500 ml-1">
              Cor do Grupo
            </label>
            <div className="flex items-center gap-2">
              {CORES_PALETA.map(c => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setCorHex(c)}
                  className={`w-7 h-7 rounded-full transition-transform cursor-pointer flex items-center justify-center ${
                    corHex === c ? "scale-115 ring-2 ring-offset-2 ring-slate-400" : "hover:scale-105"
                  }`}
                  style={{ backgroundColor: c }}
                >
                  {corHex === c && <Check size={14} className="text-white" />}
                </button>
              ))}
            </div>
          </div>

          {/* Membros do Grupo */}
          <div className="space-y-3 pt-2 border-t border-slate-100 dark:border-slate-800">
            <div className="flex items-center justify-between">
              <div>
                <label className="text-xs font-black uppercase tracking-wider text-slate-700 dark:text-slate-300">
                  Participantes do Grupo ({membrosSelecionados.length})
                </label>
                <p className="text-[11px] text-slate-400">Pelo menos 2 pessoas (você + amigos)</p>
              </div>
              <button
                type="button"
                onClick={() => setIsAddingNovoAmigo(!isAddingNovoAmigo)}
                className="text-xs font-bold text-purple-600 dark:text-purple-400 hover:underline flex items-center gap-1 cursor-pointer"
              >
                <UserPlus size={14} /> {isAddingNovoAmigo ? "Cancelar" : "+ Novo Amigo"}
              </button>
            </div>

            {/* Form rápido de novo amigo avulso */}
            {isAddingNovoAmigo && (
              <div className="p-4 bg-purple-50 dark:bg-purple-950/20 border border-purple-100 dark:border-purple-900/30 rounded-2xl space-y-3">
                <p className="text-xs font-bold text-purple-900 dark:text-purple-300">Adicionar amigo avulso:</p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <input
                    type="text"
                    placeholder="Nome completo *"
                    value={novoAmigoNome}
                    onChange={e => setNovoAmigoNome(e.target.value)}
                    className="bg-white dark:bg-slate-900 border border-purple-200 dark:border-purple-800 rounded-xl px-3 py-2 text-xs text-slate-800 dark:text-slate-100"
                  />
                  <input
                    type="email"
                    placeholder="E-mail (opcional)"
                    value={novoAmigoEmail}
                    onChange={e => setNovoAmigoEmail(e.target.value)}
                    className="bg-white dark:bg-slate-900 border border-purple-200 dark:border-purple-800 rounded-xl px-3 py-2 text-xs text-slate-800 dark:text-slate-100"
                  />
                  <input
                    type="text"
                    placeholder="WhatsApp (opcional)"
                    value={novoAmigoTelefone}
                    onChange={e => setNovoAmigoTelefone(e.target.value)}
                    className="bg-white dark:bg-slate-900 border border-purple-200 dark:border-purple-800 rounded-xl px-3 py-2 text-xs text-slate-800 dark:text-slate-100"
                  />
                </div>
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={handleAddNovoAmigo}
                    className="px-4 py-2 bg-purple-600 text-white rounded-xl text-xs font-bold hover:bg-purple-700 transition-colors cursor-pointer"
                  >
                    Adicionar ao Grupo
                  </button>
                </div>
              </div>
            )}

            {/* Chips de Membros Adicionados */}
            <div className="flex flex-wrap gap-2">
              {membrosSelecionados.map((m, idx) => (
                <div
                  key={idx}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold ${
                    m.is_user
                      ? "bg-purple-100 text-purple-800 dark:bg-purple-950/60 dark:text-purple-300"
                      : "bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200"
                  }`}
                >
                  <span>{m.nome} {m.is_user ? "(Você)" : ""}</span>
                  {!m.is_user && (
                    <button
                      type="button"
                      onClick={() => removerMembro(idx)}
                      className="text-slate-400 hover:text-rose-500 transition-colors cursor-pointer ml-1"
                    >
                      <X size={12} />
                    </button>
                  )}
                </div>
              ))}
            </div>

            {/* Seleção rápida de Contatos existentes */}
            {contatosDisponiveis.length > 0 && (
              <div className="space-y-1 pt-2">
                <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 ml-1">
                  Selecione dos seus contatos:
                </p>
                <div className="max-h-36 overflow-y-auto space-y-1 pr-1 custom-scrollbar">
                  {contatosDisponiveis.map(c => {
                    const isSelected = membrosSelecionados.some(m => m.contato_id === c.id);
                    return (
                      <div
                        key={c.id}
                        onClick={() => toggleContato(c)}
                        className={`flex items-center justify-between p-2.5 rounded-xl border transition-all cursor-pointer text-xs ${
                          isSelected
                            ? "bg-purple-50 dark:bg-purple-950/30 border-purple-300 dark:border-purple-800 font-bold text-purple-900 dark:text-purple-200"
                            : "bg-slate-50 dark:bg-slate-800/40 border-slate-100 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:border-slate-200"
                        }`}
                      >
                        <span className="truncate">{c.nome}</span>
                        <div className={`w-4 h-4 rounded-md flex items-center justify-center border ${
                          isSelected ? "bg-purple-600 border-purple-600 text-white" : "border-slate-300 dark:border-slate-700"
                        }`}>
                          {isSelected && <Check size={10} />}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* FOOTER ACTIONS */}
          <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-3 rounded-2xl text-xs font-bold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-6 py-3 rounded-2xl text-xs font-black text-white shadow-md transition-all cursor-pointer flex items-center gap-2 hover:opacity-90"
              style={{ backgroundColor: corHex }}
            >
              {loading ? "Criando Grupo..." : "Criar Grupo"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

