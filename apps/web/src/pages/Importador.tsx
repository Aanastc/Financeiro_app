import { useState, useEffect } from "react";
import { 
	Upload, 
	CheckCircle2, 
	X, 
	FileCode,
	FileSearch,
	Save,
    Sparkles,
    ArrowUpRight,
    ArrowDownRight,
    AlertCircle,
    ArrowRight,
    Users,
    FileText,
    UserPlus
} from "lucide-react";
import { financeService } from "../../../../packages/services/finance.service";
import { supabase } from "../../../../packages/services/supabase";
import { toast } from "react-hot-toast";
import { GoogleGenerativeAI } from "@google/generative-ai";
import AddContatoWeb from "../components/AddContatoWeb";

const CATEGORIAS_PADRAO = [
	"Moradia",
	"Alimentação",
	"Transporte",
	"Saúde",
	"Lazer",
	"Educação",
	"Assinaturas",
	"Presente",
	"Estetica e Comercio",
	"Emprestimo",
    "Salário",
    "Serviços",
	"Outros",
];

interface TransacaoPreview {
    id: string;
    data: string;
    descricao: string;
    valor: number;
    categoria: string;
    tipo_transacao: 'Gasto' | 'Entrada';
    classificacao: string;
    tipo: string;
    parcela_atual: number;
    total_parcelas: number;
    terceiro: boolean;
    contato_id: string;
    ignorar: boolean;
    ignoredReason: string;
}

export default function ImportadorWeb() {
	const [dragActive, setDragActive] = useState(false);
	const [file, setFile] = useState<File | null>(null);
	const [preview, setPreview] = useState<TransacaoPreview[]>([]);
	const [loading, setLoading] = useState(false);
	const [cartoes, setCartoes] = useState<any[]>([]);
    const [contatos, setContatos] = useState<any[]>([]);
    const [gastosExistentes, setGastosExistentes] = useState<any[]>([]);
    
    // Configurações Globais
    const [globalCartao, setGlobalCartao] = useState("");
    const [globalMetodoPagamento, setGlobalMetodoPagamento] = useState("Crédito");

    // Modal de Novo Contato
    const [isAddContatoOpen, setIsAddContatoOpen] = useState<string | null>(null);

	const carregarDadosBase = async () => {
		const { data: { user } } = await supabase.auth.getUser();
		if (user) {
			const dataCartoes = await financeService.getCartoes(user.id);
			setCartoes(dataCartoes || []);

            const { data: dataContatos } = await supabase.from('contatos').select('*').eq('usuario_id', user.id);
            setContatos(dataContatos || []);

            // Pegar todas as parcelas futuras/existentes do banco para matching
            const { data: dataGastos } = await supabase
                .from('gastos')
                .select('descricao, parcela_atual, total_parcelas, valor, data')
                .eq('usuario_id', user.id)
                .gt('total_parcelas', 1);
            setGastosExistentes(dataGastos || []);
		}
	};

	useEffect(() => {
		carregarDadosBase();
	}, []);

	const handleDrag = (e: any) => {
		e.preventDefault();
		e.stopPropagation();
		if (e.type === "dragenter" || e.type === "dragover") setDragActive(true);
		else if (e.type === "dragleave") setDragActive(false);
	};

	const processarArquivo = async (droppedFile: File) => {
		setFile(droppedFile);
		
		if (droppedFile.name.endsWith(".pdf")) {
            const reader = new FileReader();
            reader.onload = async (event) => {
                const base64DataUrl = event.target?.result as string;
                const base64String = base64DataUrl.split(',')[1];
                
                const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
                if (!apiKey || apiKey === "sua_chave_aqui") {
                    toast.error("Chave da API do Gemini não configurada no arquivo .env!");
                    setFile(null);
                    return;
                }

                setLoading(true);
                try {
                    const genAI = new GoogleGenerativeAI(apiKey);
                    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
                    
                    const prompt = `Você é um assistente financeiro. Analise o extrato bancário em PDF anexo. 
Retorne APENAS um JSON estrito, sem blocos de código (markdown \`\`\`json), sem textos adicionais, apenas o objeto JSON.
O JSON deve ter um array chamado "transacoes", e cada objeto deve ter:
- "data": string (formato YYYY-MM-DD)
- "descricao": string (nome limpo da transação, se for parcela mantenha a indicação X/Y)
- "valor": number (positivo, float)
- "tipo_transacao": string (exatamente "Entrada" ou "Gasto")
- "categoria": string (adivinhe uma dessas: Moradia, Alimentação, Transporte, Saúde, Lazer, Educação, Assinaturas, Presente, Estetica e Comercio, Emprestimo, Salário, Serviços, Outros)
- "parcela_atual": number (se for "1/10", coloque 1. Se não tiver parcela, 1)
- "total_parcelas": number (se for "1/10", coloque 10. Se não tiver parcela, 1)
- "terceiro": boolean (true se for pagamento para/por terceiro e não do próprio titular, ex: compra pra fulano)`;

                    const result = await model.generateContent([
                        prompt,
                        {
                            inlineData: {
                                data: base64String,
                                mimeType: "application/pdf"
                            }
                        }
                    ]);
                    
                    const text = result.response.text();
                    const cleanText = text.replace(/```json/gi, "").replace(/```/g, "").trim();
                    const json = JSON.parse(cleanText);
                    
                    const processados: TransacaoPreview[] = json.transacoes.map((t: any, index: number) => {
                        let ignorar = false;
                        let ignoredReason = "";

                        // MATCHING DE PARCELAS EXISTENTES
                        if (t.total_parcelas > 1 && t.parcela_atual > 1) {
                            const descMatch = t.descricao.replace(/\(\d+\/\d+\)/g, "").replace(/\d+\/\d+/g, "").trim().toLowerCase();
                            
                            // Procura no banco se já temos essa exata parcela
                            const exists = gastosExistentes.find(g => 
                                g.descricao.toLowerCase().includes(descMatch) && 
                                g.parcela_atual === t.parcela_atual && 
                                g.total_parcelas === t.total_parcelas
                            );
                            
                            if (exists) {
                                ignorar = true;
                                ignoredReason = `Já Lançada (${t.parcela_atual}/${t.total_parcelas})`;
                            }
                        }

                        // Try to auto-match terceiro by name if possible (not implemented fully, requires NLP on name, we just leave it blank for manual mapping)
                        
                        return {
                            id: Date.now() + index.toString(),
                            data: t.data || new Date().toISOString().split('T')[0],
                            descricao: t.descricao || "Sem descrição",
                            valor: parseFloat(t.valor) || 0,
                            tipo_transacao: t.tipo_transacao === "Entrada" ? "Entrada" : "Gasto",
                            categoria: CATEGORIAS_PADRAO.includes(t.categoria) ? t.categoria : "Outros",
                            parcela_atual: t.parcela_atual || 1,
                            total_parcelas: t.total_parcelas || 1,
                            terceiro: t.terceiro || false,
                            contato_id: "",
                            ignorar,
                            ignoredReason,
                            classificacao: "Variável",
                            tipo: "Lazer"
                        };
                    });
                    
                    setPreview(processados);
                    toast.success("PDF analisado com sucesso!");
                } catch (error: any) {
                    console.error(error);
                    toast.error("Erro na inteligência artificial: " + error.message);
                    setFile(null);
                } finally {
                    setLoading(false);
                }
            };
            reader.readAsDataURL(droppedFile);
		} else {
			toast.error("Por favor, selecione um arquivo PDF.");
            setFile(null);
		}
	};

	const handleDrop = (e: any) => {
		e.preventDefault();
		e.stopPropagation();
		setDragActive(false);
		
		const droppedFile = e.dataTransfer ? e.dataTransfer.files[0] : e.target.files[0];
		if (!droppedFile) return;
        processarArquivo(droppedFile);
	};

    const updateItem = (id: string, field: string, value: any) => {
        setPreview(prev => prev.map(p => p.id === id ? { ...p, [field]: value } : p));
    };

    const removeItem = (id: string) => {
        setPreview(prev => prev.filter(p => p.id !== id));
    };

	const handleSaveAll = async () => {
		const itemsToSave = preview.filter(p => !p.ignorar);
        if (itemsToSave.length === 0) {
            toast.error("Nenhum lançamento novo para salvar.");
            return;
        }

        // Se tiver gastos, exigir Cartão Padrão selecionado caso o método seja crédito
        const hasGastos = itemsToSave.some(i => i.tipo_transacao === "Gasto");
        if (hasGastos && globalMetodoPagamento === "Crédito" && !globalCartao) {
            toast.error("Por favor, selecione o Cartão de Crédito global no topo da tela antes de salvar.");
            return;
        }

		setLoading(true);
		try {
			const { data: { user } } = await supabase.auth.getUser();
			if (!user) throw new Error("Usuário não autenticado");

            let importados = 0;

            const entradasParaSalvar = itemsToSave
                .filter(i => i.tipo_transacao === "Entrada")
                .map(i => ({
                    usuario_id: user.id,
                    descricao: i.descricao,
                    valor: i.valor,
                    data: i.data,
                    categoria: i.categoria
                }));

            if (entradasParaSalvar.length > 0) {
                const { error } = await supabase.from("entradas").insert(entradasParaSalvar);
                if (error) throw error;
                importados += entradasParaSalvar.length;
            }

            const gastos = itemsToSave.filter(i => i.tipo_transacao === "Gasto");
            for (const item of gastos) {
                await financeService.addGasto(user.id, {
                    descricao: item.descricao,
                    valor: item.valor,
                    data: item.data,
                    categoria: item.categoria,
                    classificacao: item.classificacao,
                    tipo: item.tipo,
                    metodo_pagamento: globalMetodoPagamento,
                    cartao_id: globalMetodoPagamento === "Crédito" ? globalCartao : null,
                    parcelas: item.total_parcelas.toString(),
                    parcela_atual: item.parcela_atual,
                    total_parcelas: item.total_parcelas,
                    terceiro: item.terceiro,
                    contato_id: item.contato_id || null
                });
                importados++;
            }

			toast.success(`${importados} lançamentos importados com sucesso!`);
			setPreview([]);
			setFile(null);
		} catch (error: any) {
			console.error(error);
			toast.error("Erro ao importar: " + error.message);
		} finally {
			setLoading(false);
		}
	};

	return (
		<div className="p-4 md:p-8 space-y-8 bg-[#FDFCFB] min-h-screen">
			<div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 bg-white p-8 rounded-[40px] shadow-sm border border-gray-100">
				<div className="space-y-1">
					<div className="flex items-center gap-3">
						<div className="bg-indigo-100 p-2 rounded-xl text-indigo-600">
							<Sparkles size={24} />
						</div>
						<h1 className="text-3xl font-black text-[#2D2424]">Importador IA (Gemini)</h1>
					</div>
					<p className="text-gray-400 font-medium text-sm ml-12">Arraste seu extrato em PDF para leitura automática</p>
				</div>
			</div>

			{!file ? (
				<div 
					onDragEnter={handleDrag}
					onDragLeave={handleDrag}
					onDragOver={handleDrag}
					onDrop={handleDrop}
					className={`
						relative h-[400px] rounded-[50px] border-4 border-dashed transition-all flex flex-col items-center justify-center gap-6
						${dragActive ? 'border-indigo-500 bg-indigo-50/50 scale-[0.99]' : 'border-gray-100 bg-white hover:border-indigo-200 hover:bg-indigo-50/20'}
					`}
				>
					<input 
						type="file" 
						className="absolute inset-0 opacity-0 cursor-pointer" 
						onChange={(e) => {
                            if (e.target.files && e.target.files.length > 0) {
                                processarArquivo(e.target.files[0]);
                            }
                        }}
						accept=".pdf"
					/>
					
					<div className="w-24 h-24 bg-indigo-50 rounded-full flex items-center justify-center text-indigo-500 animate-bounce">
						<FileSearch size={40} />
					</div>
					
					<div className="text-center space-y-2">
						<h3 className="text-xl font-black text-[#2D2424]">Arraste seu extrato PDF aqui</h3>
						<p className="text-gray-400 font-bold uppercase text-[10px] tracking-widest">Processamento automático com Gemini 2.5 Flash</p>
					</div>

					<button className="px-8 py-3 bg-indigo-500 text-white rounded-2xl font-black text-sm shadow-xl shadow-indigo-100">
						SELECIONAR PDF
					</button>
				</div>
			) : (
				<div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
					<div className="bg-white p-6 rounded-[35px] border border-gray-100 flex items-center justify-between">
						<div className="flex items-center gap-4">
							<div className="w-12 h-12 bg-indigo-500 text-white rounded-2xl flex items-center justify-center">
								<FileCode size={24} />
							</div>
							<div>
								<h4 className="font-black text-[#2D2424]">{file.name}</h4>
								<p className="text-xs font-bold text-gray-400 uppercase tracking-tighter">
                                    {loading ? "Processando com IA..." : `${preview.length} Lançamentos detectados`}
                                </p>
							</div>
						</div>
						<button 
							onClick={() => { setFile(null); setPreview([]); }}
							className="p-3 hover:bg-gray-50 rounded-full text-gray-400"
						>
							<X size={20} />
						</button>
					</div>

                    {loading ? (
                        <div className="bg-white rounded-[40px] shadow-sm border border-gray-100 p-20 flex flex-col items-center justify-center gap-4">
                            <Sparkles className="text-indigo-500 animate-pulse" size={48} />
                            <p className="font-black text-lg text-slate-700">A Inteligência Artificial está lendo o PDF...</p>
                            <p className="text-slate-400 font-medium text-sm">Isso pode levar alguns segundos.</p>
                        </div>
                    ) : (
					<div className="bg-white rounded-[40px] shadow-sm border border-gray-100 overflow-hidden flex flex-col">
						
                        {/* GLOBAL CONFIGURATION BAR */}
                        <div className="p-6 border-b border-gray-100 bg-white flex flex-col md:flex-row justify-between items-center gap-4">
							<div className="flex items-center gap-4 w-full md:w-auto">
								<div className="w-10 h-10 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center shadow-sm">
                                    <FileText size={18} />
                                </div>
                                <div>
                                    <h3 className="font-black text-sm text-slate-800">Origem do Extrato</h3>
                                    <p className="text-xs font-bold text-slate-400">Aplicar a todos os itens</p>
                                </div>
							</div>

                            <div className="flex items-center gap-4 w-full md:w-auto">
                                <select 
                                    className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 font-bold text-sm outline-none focus:ring-2 focus:ring-indigo-500 text-slate-600 cursor-pointer"
                                    value={globalMetodoPagamento}
                                    onChange={(e) => setGlobalMetodoPagamento(e.target.value)}
                                >
                                    <option value="Débito">Débito (Conta Corrente)</option>
                                    <option value="Pix">Pix (Conta Corrente)</option>
                                    <option value="Crédito">Cartão de Crédito (Fatura)</option>
                                </select>

                                {globalMetodoPagamento === "Crédito" && (
                                    <select 
                                        className="bg-indigo-50 border border-indigo-200 rounded-xl px-4 py-3 font-black text-sm outline-none focus:ring-2 focus:ring-indigo-500 text-indigo-600 cursor-pointer"
                                        value={globalCartao}
                                        onChange={(e) => setGlobalCartao(e.target.value)}
                                    >
                                        <option value="">SELECIONE O CARTÃO</option>
                                        {cartoes.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                                    </select>
                                )}

                                <button 
                                    onClick={handleSaveAll}
                                    disabled={loading}
                                    className="px-6 py-3 bg-green-500 text-white rounded-xl font-black text-sm flex items-center gap-2 hover:bg-green-600 transition-all shadow-lg shadow-green-100 disabled:opacity-50"
                                >
                                    <Save size={18} /> SALVAR IMPORTAÇÃO
                                </button>
                            </div>
						</div>

						<div className="overflow-x-auto">
							<table className="w-full text-left min-w-[1000px]">
								<thead className="bg-slate-50">
									<tr className="text-[10px] font-black text-gray-400 uppercase">
										<th className="p-4">Tipo</th>
										<th className="p-4">Data</th>
										<th className="p-4">Descrição</th>
										<th className="p-4">Valor (R$)</th>
										<th className="p-4">Categoria</th>
										<th className="p-4">Terceiros (Dívida)</th>
										<th className="p-4 text-center">Ação</th>
									</tr>
								</thead>
								<tbody className="divide-y divide-gray-100">
									{preview.map((item) => {
                                        if (item.ignorar) {
                                            return (
                                                <tr key={item.id} className="bg-slate-50/50 opacity-60">
                                                    <td className="p-4" colSpan={6}>
                                                        <div className="flex items-center gap-3">
                                                            <div className="w-8 h-8 rounded-full bg-green-100 text-green-600 flex items-center justify-center">
                                                                <CheckCircle2 size={16} />
                                                            </div>
                                                            <div>
                                                                <span className="font-black text-slate-800 line-through">{item.descricao}</span>
                                                                <span className="ml-3 font-bold text-xs text-green-600 uppercase tracking-wide">✅ {item.ignoredReason}</span>
                                                            </div>
                                                        </div>
                                                    </td>
                                                    <td className="p-4 text-center">
                                                        <button onClick={() => removeItem(item.id)} className="p-2 text-slate-300 hover:text-rose-500 rounded-xl transition-colors">
                                                            <X size={18} />
                                                        </button>
                                                    </td>
                                                </tr>
                                            );
                                        }

                                        return (
										<tr key={item.id} className="hover:bg-slate-50/50 transition-colors">
                                            {/* TIPO */}
                                            <td className="p-4">
                                                <div className="flex items-center gap-2">
                                                    <button 
                                                        onClick={() => updateItem(item.id, "tipo_transacao", item.tipo_transacao === "Gasto" ? "Entrada" : "Gasto")}
                                                        className={`p-2 rounded-xl flex items-center gap-1 font-bold text-xs transition-colors ${item.tipo_transacao === "Gasto" ? 'bg-rose-100 text-rose-600' : 'bg-emerald-100 text-emerald-600'}`}
                                                    >
                                                        {item.tipo_transacao === "Gasto" ? <ArrowDownRight size={14}/> : <ArrowUpRight size={14}/>}
                                                        {item.tipo_transacao}
                                                    </button>
                                                </div>
                                            </td>

                                            {/* DATA */}
											<td className="p-4">
                                                <input 
                                                    type="date" 
                                                    className="w-full bg-transparent outline-none font-bold text-sm text-slate-700 p-2 rounded-lg hover:bg-slate-100 focus:bg-slate-100"
                                                    value={item.data}
                                                    onChange={(e) => updateItem(item.id, "data", e.target.value)}
                                                />
                                            </td>

                                            {/* DESCRIÇÃO */}
											<td className="p-4">
                                                <div className="flex flex-col">
                                                    <input 
                                                        type="text" 
                                                        className="w-full bg-transparent outline-none font-black text-sm text-slate-700 p-2 rounded-lg hover:bg-slate-100 focus:bg-slate-100"
                                                        value={item.descricao}
                                                        onChange={(e) => updateItem(item.id, "descricao", e.target.value)}
                                                    />
                                                    {item.total_parcelas > 1 && (
                                                        <span className="text-[10px] font-bold text-slate-400 px-2 uppercase tracking-wide">
                                                            Parcela {item.parcela_atual} de {item.total_parcelas}
                                                        </span>
                                                    )}
                                                </div>
											</td>

                                            {/* VALOR */}
											<td className="p-4">
                                                <input 
                                                    type="number" 
                                                    step="0.01"
                                                    className={`w-full bg-transparent outline-none font-black text-sm p-2 rounded-lg hover:bg-slate-100 focus:bg-slate-100 ${item.tipo_transacao === 'Entrada' ? 'text-emerald-600' : 'text-slate-800'}`}
                                                    value={item.valor}
                                                    onChange={(e) => updateItem(item.id, "valor", parseFloat(e.target.value) || 0)}
                                                />
											</td>

                                            {/* CATEGORIA */}
                                            <td className="p-4">
                                                <select 
                                                    className="w-full bg-transparent outline-none font-bold text-xs text-slate-600 p-2 rounded-lg hover:bg-slate-100 focus:bg-slate-100 cursor-pointer"
                                                    value={item.categoria}
                                                    onChange={(e) => updateItem(item.id, "categoria", e.target.value)}
                                                >
                                                    {CATEGORIAS_PADRAO.map(c => <option key={c} value={c}>{c}</option>)}
                                                </select>
                                            </td>

                                            {/* TERCEIROS */}
                                            <td className="p-4">
                                                <div className="flex flex-col gap-2">
                                                    <div className="flex items-center gap-2">
                                                        <button 
                                                            onClick={() => updateItem(item.id, "terceiro", !item.terceiro)}
                                                            className={`px-3 py-2 rounded-lg font-bold text-xs flex items-center gap-2 transition-colors flex-1 ${item.terceiro ? 'bg-amber-100 text-amber-600' : 'bg-slate-100 text-slate-400 hover:bg-slate-200'}`}
                                                        >
                                                            <Users size={14} /> 
                                                            {item.terceiro ? "Para Terceiro" : "Meu Gasto"}
                                                        </button>
                                                        <button
                                                            onClick={() => {
                                                                updateItem(item.id, "terceiro", true);
                                                                setIsAddContatoOpen(item.id);
                                                            }}
                                                            className="p-2 text-slate-400 hover:text-[#D97706] hover:bg-amber-50 rounded-xl transition-all border border-slate-100 hover:border-amber-200"
                                                            title="Cadastrar Novo Devedor"
                                                        >
                                                            <UserPlus size={14} />
                                                        </button>
                                                    </div>
                                                    
                                                    {item.terceiro && (
                                                        <select
                                                            className="w-full bg-amber-50 text-amber-700 outline-none font-bold text-xs p-2 rounded-lg focus:ring-2 focus:ring-amber-300 cursor-pointer"
                                                            value={item.contato_id}
                                                            onChange={(e) => {
                                                                if (e.target.value === "NOVO_DEVEDOR") {
                                                                    setIsAddContatoOpen(item.id);
                                                                } else {
                                                                    updateItem(item.id, "contato_id", e.target.value);
                                                                }
                                                            }}
                                                        >
                                                            <option value="">Selecione quem deve</option>
                                                            {contatos.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                                                            <option value="NOVO_DEVEDOR" className="font-black text-amber-600">+ Cadastrar Novo Devedor</option>
                                                        </select>
                                                    )}
                                                </div>
                                            </td>

                                            {/* REMOVER */}
											<td className="p-4 text-center">
												<button 
                                                    onClick={() => removeItem(item.id)}
                                                    className="p-2 text-slate-300 hover:bg-rose-50 hover:text-rose-500 rounded-xl transition-colors"
                                                >
													<X size={18} />
												</button>
											</td>
										</tr>
									)}
                                    )}
								</tbody>
							</table>
						</div>
					</div>
                    )}
				</div>
			)}
			<div className="grid grid-cols-1 md:grid-cols-3 gap-6">
				<div className="bg-indigo-600 p-8 rounded-[40px] text-white space-y-4">
					<div className="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center">
						<CheckCircle2 size={24} />
					</div>
					<h4 className="text-xl font-black">Seguro e Inteligente</h4>
					<p className="text-indigo-100 text-sm font-medium leading-relaxed">Parcelas que já constam no banco são ignoradas automaticamente.</p>
				</div>
				<div className="bg-white p-8 rounded-[40px] border border-gray-100 space-y-4 shadow-sm">
					<div className="w-12 h-12 bg-gray-50 rounded-2xl flex items-center justify-center text-indigo-500">
						<AlertCircle size={24} />
					</div>
					<h4 className="text-xl font-black text-[#2D2424]">Cartão Global</h4>
					<p className="text-gray-400 text-sm font-medium leading-relaxed">Selecione o cartão de destino no topo uma única vez para toda a fatura.</p>
				</div>
				<div className="bg-white p-8 rounded-[40px] border border-gray-100 space-y-4 shadow-sm">
					<div className="w-12 h-12 bg-gray-50 rounded-2xl flex items-center justify-center text-indigo-500">
						<Users size={24} />
					</div>
					<h4 className="text-xl font-black text-[#2D2424]">Gestão de Terceiros</h4>
					<p className="text-gray-400 text-sm font-medium leading-relaxed">Marque gastos como "Terceiros" e vincule ao Devedor direto na importação.</p>
				</div>
			</div>

            {isAddContatoOpen && (
                <AddContatoWeb 
                    onClose={() => setIsAddContatoOpen(null)}
                    onSuccess={async (newId) => {
                        // Atualiza a lista de contatos para incluir o novo na tela
                        const { data: { user } } = await supabase.auth.getUser();
                        if (user) {
                            const { data: dataContatos } = await supabase.from('contatos').select('*').eq('usuario_id', user.id);
                            setContatos(dataContatos || []);
                        }
                        // Vincula a linha atual ao novo contato automaticamente
                        updateItem(isAddContatoOpen, "contato_id", newId);
                        setIsAddContatoOpen(null);
                    }}
                />
            )}
		</div>
	);
}
