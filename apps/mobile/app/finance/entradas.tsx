import { useState, useEffect, useCallback } from "react";
import {
	View,
	Text,
	SafeAreaView,
	ScrollView,
	TouchableOpacity,
	ActivityIndicator,
	Alert,
} from "react-native";
import { supabase } from "../../../../packages/services/supabase";
import tw from "twrnc";
import { NavBar } from "@/components/app_components/NavBar";
import { FinanceModal } from "@/components/app_components/FinanceModal";
import { EditFinanceModal } from "@/components/app_components/EditFinanceModal";
import {
	Plus,
	Edit3,
	ChevronLeft,
	ChevronRight,
	PieChart as PieIcon,
	TrendingUp,
} from "lucide-react-native";

const MESES_ABREV = [
	"Jan",
	"Fev",
	"Mar",
	"Abr",
	"Mai",
	"Jun",
	"Jul",
	"Ago",
	"Set",
	"Out",
	"Nov",
	"Dez",
];

export default function EntradasScreen() {
	const [loading, setLoading] = useState(true);
	const [year, setYear] = useState(new Date().getFullYear());

	const [entradas, setEntradas] = useState<any[]>([]);
	const [dataMatrix, setDataMatrix] = useState<any[]>([]);
	const [monthTotal, setMonthTotal] = useState(0);
	const [descricoesUnicas, setDescricoesUnicas] = useState<string[]>([]);

	// Estados dos Modais
	const [addModalVisible, setAddModalVisible] = useState(false);
	const [editModalVisible, setEditModalVisible] = useState(false);

	// Form Novo Registro
	const [descricao, setDescricao] = useState("");
	const [valor, setValor] = useState("");

	const loadData = useCallback(async () => {
		setLoading(true);
		try {
			const {
				data: { user },
			} = await supabase.auth.getUser();
			if (!user) return;

			const { data, error } = await supabase
				.from("entradas")
				.select("*")
				.eq("usuario_id", user.id)
				.gte("data", `${year}-01-01`)
				.lte("data", `${year}-12-31`)
				.order("data", { ascending: false });

			if (error) throw error;

			const rows = data || [];
			setEntradas(rows);
			setDescricoesUnicas(Array.from(new Set(rows.map((r) => r.descricao))));

			// 1. Lógica da Tabela Matriz
			const matrix: any = {};
			rows.forEach((item) => {
				const mesIdx = new Date(item.data).getUTCMonth();
				if (!matrix[item.descricao]) matrix[item.descricao] = Array(12).fill(0);
				matrix[item.descricao][mesIdx] += Number(item.valor);
			});

			setDataMatrix(
				Object.keys(matrix).map((desc) => ({
					descricao: desc,
					valores: matrix[desc],
					media: matrix[desc].reduce((a: number, b: number) => a + b, 0) / 12,
				})),
			);

			// 2. Total Mês Atual (Regra 50/30/20)
			const currentMonth = new Date().getMonth();
			const totalMes = rows
				.filter((item) => new Date(item.data).getMonth() === currentMonth)
				.reduce((acc, curr) => acc + Number(curr.valor), 0);
			setMonthTotal(totalMes);
		} catch (e: any) {
			Alert.alert("Erro", e.message);
		} finally {
			setLoading(false);
		}
	}, [year]);

	useEffect(() => {
		loadData();
	}, [loadData]);

	const handleSaveNew = async () => {
		if (!descricao || !valor) return Alert.alert("Erro", "Preencha tudo!");
		try {
			const {
				data: { user },
			} = await supabase.auth.getUser();
			await supabase.from("entradas").insert([
				{
					usuario_id: user?.id,
					descricao,
					valor: Number(valor.replace(",", ".")),
					data: new Date().toISOString().split("T")[0],
				},
			]);
			setAddModalVisible(false);
			setDescricao("");
			setValor("");
			loadData();
		} catch (e: any) {
			Alert.alert("Erro", e.message);
		}
	};

	return (
		<SafeAreaView style={tw`flex-1 bg-[#FCF8F8]`}>
			<NavBar />
			<ScrollView contentContainerStyle={tw`pb-24`}>
				{/* HEADER COM BOTÕES LADO A LADO */}
				<View style={tw`p-6 flex-row justify-between items-center`}>
					<View>
						<Text style={tw`text-[#5D4037] text-2xl font-black`}>Entradas</Text>
						<View style={tw`flex-row items-center mt-1`}>
							<TouchableOpacity onPress={() => setYear(year - 1)}>
								<ChevronLeft size={20} color="#4CAF50" />
							</TouchableOpacity>
							<Text style={tw`mx-4 font-bold text-[#5D4037]`}>{year}</Text>
							<TouchableOpacity onPress={() => setYear(year + 1)}>
								<ChevronRight size={20} color="#4CAF50" />
							</TouchableOpacity>
						</View>
					</View>

					{/* BOTÕES DE AÇÃO */}
					<View style={tw`flex-row gap-x-2`}>
						<TouchableOpacity
							onPress={() => setEditModalVisible(true)}
							style={tw`bg-white p-4 rounded-3xl border border-gray-100 shadow-sm`}>
							<Edit3 size={24} color="#5D4037" />
						</TouchableOpacity>
						<TouchableOpacity
							onPress={() => setAddModalVisible(true)}
							style={tw`bg-[#4CAF50] p-4 rounded-3xl shadow-lg shadow-green-100`}>
							<Plus size={24} color="white" />
						</TouchableOpacity>
					</View>
				</View>

				{/* 1. TABELA MATRIZ (Comparativo Mensal) */}
				<View style={tw`mb-8`}>
					<Text
						style={tw`px-6 mb-3 text-[#5D4037] font-black text-xs uppercase tracking-widest`}>
						Matriz de Lançamentos
					</Text>
					<ScrollView
						horizontal
						showsHorizontalScrollIndicator={false}
						contentContainerStyle={tw`px-6`}>
						<View
							style={tw`bg-white rounded-[30px] overflow-hidden border border-gray-100 shadow-sm`}>
							<View style={tw`flex-row bg-[#5D4037] p-4`}>
								<Text style={tw`w-32 text-white/70 font-bold text-xs`}>
									DESCRIÇÃO
								</Text>
								{MESES_ABREV.map((m) => (
									<Text
										key={m}
										style={tw`w-16 text-white/70 font-bold text-center text-[10px]`}>
										{m}
									</Text>
								))}
								<Text
									style={tw`w-20 text-white font-black text-center text-xs`}>
									MÉDIA
								</Text>
							</View>

							{loading ? (
								<ActivityIndicator style={tw`m-10`} color="#5D4037" />
							) : (
								dataMatrix.map((row, i) => (
									<View
										key={i}
										style={tw`flex-row border-b border-gray-50 p-4 items-center ${i % 2 === 0 ? "bg-white" : "bg-[#FCF8F8]"}`}>
										<Text
											style={tw`w-32 font-bold text-[#5D4037] text-xs`}
											numberOfLines={1}>
											{row.descricao}
										</Text>
										{row.valores.map((v: number, idx: number) => (
											<Text
												key={idx}
												style={tw`w-16 text-center text-[10px] ${v > 0 ? "text-[#4CAF50] font-bold" : "text-gray-300"}`}>
												{v > 0 ? v.toFixed(0) : "—"}
											</Text>
										))}
										<Text
											style={tw`w-20 text-center font-black text-[#5D4037] text-xs`}>
											R$ {row.media.toFixed(0)}
										</Text>
									</View>
								))
							)}
						</View>
					</ScrollView>
				</View>

				{/* 2. REGRA 50/30/20 (Card Marrom) */}
				<View style={tw`px-6 mb-8`}>
					<View style={tw`bg-[#5D4037] p-6 rounded-[40px] shadow-lg`}>
						<View style={tw`flex-row items-center mb-4`}>
							<PieIcon
								size={18}
								color="rgba(255,255,255,0.7)"
								style={tw`mr-2`}
							/>
							<Text
								style={tw`text-white/70 font-bold uppercase text-[10px] tracking-widest`}>
								Sugestão 50-30-20
							</Text>
						</View>
						<View style={tw`gap-y-4`}>
							<ProgressBar
								label="Essencial (50%)"
								value={monthTotal * 0.5}
								color="#4CAF50"
							/>
							<ProgressBar
								label="Lazer (30%)"
								value={monthTotal * 0.3}
								color="#FF80AB"
							/>
							<ProgressBar
								label="Investir (20%)"
								value={monthTotal * 0.2}
								color="#FFFFFF"
							/>
						</View>
					</View>
				</View>

				{/* 3. ÚLTIMOS 5 LANÇAMENTOS */}
				<View style={tw`px-6`}>
					<View
						style={tw`bg-white rounded-[40px] p-6 shadow-sm border border-gray-100`}>
						<View style={tw`flex-row items-center mb-6`}>
							<TrendingUp size={20} color="#5D4037" style={tw`mr-2`} />
							<Text style={tw`font-black text-[#5D4037] text-lg`}>
								Últimos 5 Lançamentos
							</Text>
						</View>
						{entradas.slice(0, 5).map((item, index) => (
							<View
								key={item.id}
								style={tw`flex-row justify-between items-center py-4 ${index !== 4 ? "border-b border-gray-50" : ""}`}>
								<View style={tw`flex-1`}>
									<Text style={tw`text-[#5D4037] font-bold`}>
										{item.descricao}
									</Text>
									<Text style={tw`text-gray-400 text-[10px]`}>
										{new Date(item.data).toLocaleDateString()}
									</Text>
								</View>
								<Text style={tw`font-black text-[#4CAF50]`}>
									+ R$ {Number(item.valor).toFixed(2)}
								</Text>
							</View>
						))}
					</View>
				</View>
			</ScrollView>

			{/* MODAL DE ADICIONAR */}
			<FinanceModal
				visible={addModalVisible}
				title="Nova Entrada"
				type="entrada"
				descricao={descricao}
				setDescricao={setDescricao}
				valor={valor}
				setValor={setValor}
				sugestoes={descricoesUnicas}
				onClose={() => setAddModalVisible(false)}
				onSave={handleSaveNew}
			/>

			{/* MODAL DE EDITAR/EXCLUIR */}
			<EditFinanceModal
				visible={editModalVisible}
				type="entrada"
				lancamentos={entradas}
				onClose={() => setEditModalVisible(false)}
				onSave={async (id, novoValor) => {
					await supabase
						.from("entradas")
						.update({ valor: Number(novoValor) })
						.eq("id", id);
					setEditModalVisible(false);
					loadData();
				}}
				onDelete={async (id) => {
					await supabase.from("entradas").delete().eq("id", id);
					setEditModalVisible(false);
					loadData();
				}}
			/>
		</SafeAreaView>
	);
}

function ProgressBar({ label, value, color }: any) {
	return (
		<View>
			<View style={tw`flex-row justify-between mb-1`}>
				<Text style={tw`text-white/60 text-[10px] font-bold`}>{label}</Text>
				<Text style={tw`text-white text-[10px] font-black`}>
					R$ {value.toFixed(2)}
				</Text>
			</View>
			<View style={tw`h-1.5 bg-white/10 rounded-full overflow-hidden`}>
				<View
					style={[
						tw`h-full rounded-full`,
						{ backgroundColor: color, width: "100%" },
					]}
				/>
			</View>
		</View>
	);
}
