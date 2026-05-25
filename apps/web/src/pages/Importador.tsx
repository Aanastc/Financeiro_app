import { useState, useCallback } from "react";
import { 
	Upload, 
	FileText, 
	CheckCircle2, 
	AlertCircle, 
	ArrowRight, 
	X, 
	FileCode,
	FileSearch,
	Save
} from "lucide-react";
import { financeService } from "../../../../packages/services/finance.service";
import { supabase } from "../../../../packages/services/supabase";
import { toast } from "react-hot-toast";
import { useEffect } from "react";

const MAPPING_CATEGORIAS: any = {
	"Uber": "Transporte",
	"99App": "Transporte",
	"Ifood": "Alimentação",
	"Mac Donalds": "Alimentação",
	"Cacau Show": "Alimentação",
	"Drogasil": "Saúde",
	"Fiap": "Educação",
	"Netflix": "Assinaturas",
	"Spotify": "Assinaturas",
	"Porao": "Lazer",
	"Pagamento recebido": "IGNORE",
	"Pagamento de fatura": "IGNORE"
};

export default function ImportadorWeb() {
	const [dragActive, setDragActive] = useState(false);
	const [file, setFile] = useState<File | null>(null);
	const [preview, setPreview] = useState<any[]>([]);
	const [loading, setLoading] = useState(false);
	const [cartoes, setCartoes] = useState<any[]>([]);
	const [selectedCartao, setSelectedCartao] = useState("");

	const carregarCartoes = async () => {
		const { data: { user } } = await supabase.auth.getUser();
		if (user) {
			const data = await financeService.getCartoes(user.id);
			setCartoes(data || []);
		}
	};

	useEffect(() => {
		carregarCartoes();
	}, []);

	const handleDrag = (e: any) => {
		e.preventDefault();
		e.stopPropagation();
		if (e.type === "dragenter" || e.type === "dragover") setDragActive(true);
		else if (e.type === "dragleave") setDragActive(false);
	};

	const sugerirCategoria = (titulo: string) => {
		for (const key in MAPPING_CATEGORIAS) {
			if (titulo.toLowerCase().includes(key.toLowerCase())) {
				return MAPPING_CATEGORIAS[key];
			}
		}
		return "Outros";
	};

	const detectarParcelas = (titulo: string) => {
		const match = titulo.match(/(\d+)\/(\d+)/);
		if (match) {
			return { atual: parseInt(match[1]), total: parseInt(match[2]) };
		}
		return null;
	};

	const parseCSV = (text: string) => {
		const lines = text.split("\n");
		const result = [];
		const headers = lines[0].split(",");

		for (let i = 1; i < lines.length; i++) {
			if (!lines[i]) continue;
			const currentline = lines[i].split(",");
			const obj: any = {};
			headers.forEach((header, index) => {
				obj[header.trim()] = currentline[index]?.trim();
			});
			result.push(obj);
		}
		return result;
	};

	const handleDrop = async (e: any) => {
		e.preventDefault();
		e.stopPropagation();
		setDragActive(false);
		
		const droppedFile = e.dataTransfer ? e.dataTransfer.files[0] : e.target.files[0];
		if (!droppedFile) return;

		setFile(droppedFile);
		
		if (droppedFile.name.endsWith(".csv")) {
			const reader = new FileReader();
			reader.onload = (event) => {
				const text = event.target?.result as string;
				const data = parseCSV(text);
				
				const processados = data
					.map(item => {
						const categoria = sugerirCategoria(item.title || "");
						if (categoria === "IGNORE") return null;

						const parcelamento = detectarParcelas(item.title || "");

						return {
							data: item.date,
							descricao: item.title,
							valor: parseFloat(item.amount),
							categoria: categoria,
							metodo_pagamento: "Crédito", // Por padrão assumimos crédito para faturas importadas
							parcela_atual: parcelamento?.atual || 1,
							total_parcelas: parcelamento?.total || 1,
							status: 'pending'
						};
					})
					.filter(Boolean);

				setPreview(processados);
			};
			reader.readAsText(droppedFile);
		} else {
			toast.error("Por enquanto, suportamos apenas CSV. O processamento de PDF está em desenvolvimento.");
		}
	};

	const handleSaveAll = async () => {
		if (preview.length === 0) return;
		if (!selectedCartao) {
			toast.error("Selecione um cartão antes de salvar!");
			return;
		}

		setLoading(true);
		try {
			const { data: { user } } = await supabase.auth.getUser();
			if (!user) throw new Error("Usuário não autenticado");

			const gastosParaSalvar = preview.map(item => ({
				descricao: item.descricao,
				valor: Math.abs(item.valor),
				data: item.data,
				categoria: item.categoria,
				metodo_pagamento: "Crédito",
				cartao_id: selectedCartao,
				parcela_atual: item.parcela_atual,
				total_parcelas: item.total_parcelas
			}));

			await financeService.bulkAddGastos(user.id, gastosParaSalvar);

			toast.success(`${preview.length} lançamentos importados com sucesso!`);
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
		<div className="p-8 space-y-8 bg-[#FDFCFB] min-h-screen">
			<div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 bg-white p-8 rounded-[40px] shadow-sm border border-gray-100">
				<div className="space-y-1">
					<div className="flex items-center gap-3">
						<div className="bg-blue-100 p-2 rounded-xl text-blue-600">
							<Upload size={24} />
						</div>
						<h1 className="text-3xl font-black text-[#2D2424]">Importador Inteligente</h1>
					</div>
					<p className="text-gray-400 font-medium text-sm ml-12">Arraste seus extratos bancários para processamento automático</p>
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
						${dragActive ? 'border-blue-500 bg-blue-50/50 scale-[0.99]' : 'border-gray-100 bg-white hover:border-blue-200 hover:bg-blue-50/20'}
					`}
				>
					<input 
						type="file" 
						className="absolute inset-0 opacity-0 cursor-pointer" 
						onChange={handleDrop}
						accept=".csv,.pdf"
					/>
					
					<div className="w-24 h-24 bg-blue-50 rounded-full flex items-center justify-center text-blue-500 animate-bounce">
						<FileSearch size={40} />
					</div>
					
					<div className="text-center space-y-2">
						<h3 className="text-xl font-black text-[#2D2424]">Arraste seu extrato aqui</h3>
						<p className="text-gray-400 font-bold uppercase text-[10px] tracking-widest">Suportamos CSV e PDF do Nubank, Inter e outros</p>
					</div>

					<button className="px-8 py-3 bg-blue-500 text-white rounded-2xl font-black text-sm shadow-xl shadow-blue-100">
						SELECIONAR ARQUIVO
					</button>
				</div>
			) : (
				<div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
					<div className="bg-white p-6 rounded-[35px] border border-gray-100 flex items-center justify-between">
						<div className="flex items-center gap-4">
							<div className="w-12 h-12 bg-blue-500 text-white rounded-2xl flex items-center justify-center">
								<FileCode size={24} />
							</div>
							<div>
								<h4 className="font-black text-[#2D2424]">{file.name}</h4>
								<p className="text-xs font-bold text-gray-400 uppercase tracking-tighter">{(file.size / 1024).toFixed(1)} KB • {preview.length} Lançamentos detectados</p>
							</div>
						</div>
						<button 
							onClick={() => { setFile(null); setPreview([]); }}
							className="p-3 hover:bg-gray-50 rounded-full text-gray-400"
						>
							<X size={20} />
						</button>
					</div>

					<div className="bg-white rounded-[40px] shadow-sm border border-gray-100 overflow-hidden">
						<div className="p-8 border-b border-gray-50 flex flex-col md:flex-row justify-between items-center gap-4 bg-gray-50/30">
							<div className="flex items-center gap-6">
								<h3 className="font-black text-[#2D2424] text-xs uppercase tracking-widest flex items-center gap-2">
									<FileText size={16} className="text-blue-500" /> Pré-visualização
								</h3>
								
								<select 
									className="bg-white border border-gray-200 rounded-xl px-4 py-2 font-bold text-xs outline-none focus:ring-2 focus:ring-blue-500"
									value={selectedCartao}
									onChange={(e) => setSelectedCartao(e.target.value)}
								>
									<option value="">SELECIONE O CARTÃO</option>
									{cartoes.map(c => (
										<option key={c.id} value={c.id}>{c.nome.toUpperCase()}</option>
									))}
								</select>
							</div>

							<button 
								onClick={handleSaveAll}
								disabled={loading}
								className="px-6 py-3 bg-green-500 text-white rounded-2xl font-black text-xs flex items-center gap-2 hover:bg-green-600 transition-all shadow-lg shadow-green-100 disabled:opacity-50"
							>
								{loading ? "PROCESSANDO..." : <><Save size={16} /> CONFIRMAR IMPORTAÇÃO</>}
							</button>
						</div>
						<div className="overflow-x-auto max-h-[500px]">
							<table className="w-full text-left">
								<thead className="sticky top-0 bg-white z-10">
									<tr className="text-[10px] font-black text-gray-400 uppercase border-b border-gray-50">
										<th className="p-6">Data</th>
										<th className="p-6">Descrição</th>
										<th className="p-6 text-right">Valor</th>
										<th className="p-6 text-center">Ação</th>
									</tr>
								</thead>
								<tbody className="divide-y divide-gray-50">
									{preview.map((item, idx) => (
										<tr key={idx} className="hover:bg-blue-50/30 transition-colors group">
											<td className="p-6 font-bold text-gray-400 text-sm">{item.data}</td>
											<td className="p-6">
												<span className="font-black text-[#2D2424]">{item.descricao}</span>
											</td>
											<td className={`p-6 text-right font-black ${Number(item.valor) < 0 ? 'text-green-500' : 'text-[#2D2424]'}`}>
												R$ {Math.abs(Number(item.valor)).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
											</td>
											<td className="p-6 text-center">
												<button className="text-gray-200 hover:text-red-500">
													<X size={18} />
												</button>
											</td>
										</tr>
									))}
								</tbody>
							</table>
						</div>
					</div>
				</div>
			)}

			<div className="grid grid-cols-1 md:grid-cols-3 gap-6">
				<div className="bg-blue-600 p-8 rounded-[40px] text-white space-y-4">
					<div className="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center">
						<CheckCircle2 size={24} />
					</div>
					<h4 className="text-xl font-black">Seguro e Privado</h4>
					<p className="text-blue-100 text-sm font-medium leading-relaxed">Seus dados são processados localmente no navegador e nunca armazenamos seus arquivos.</p>
				</div>
				<div className="bg-white p-8 rounded-[40px] border border-gray-100 space-y-4 shadow-sm">
					<div className="w-12 h-12 bg-gray-50 rounded-2xl flex items-center justify-center text-blue-500">
						<AlertCircle size={24} />
					</div>
					<h4 className="text-xl font-black text-[#2D2424]">Categorização IA</h4>
					<p className="text-gray-400 text-sm font-medium leading-relaxed">Nosso sistema aprende com seus lançamentos e categoriza automaticamente as despesas futuras.</p>
				</div>
				<div className="bg-white p-8 rounded-[40px] border border-gray-100 space-y-4 shadow-sm">
					<div className="w-12 h-12 bg-gray-50 rounded-2xl flex items-center justify-center text-blue-500">
						<ArrowRight size={24} />
					</div>
					<h4 className="text-xl font-black text-[#2D2424]">Fácil e Rápido</h4>
					<p className="text-gray-400 text-sm font-medium leading-relaxed">Importe faturas inteiras de cartões de crédito em menos de 10 segundos.</p>
				</div>
			</div>
		</div>
	);
}
