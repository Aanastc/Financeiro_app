import React, { useState, useEffect, useCallback } from "react";
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
import { FinanceModal } from "@/components/app_components/FinanceModal";

const MESES = [
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

export default function Entradas() {
	const [loading, setLoading] = useState(true);
	const [year, setYear] = useState(new Date().getFullYear());
	const [dataMatrix, setDataMatrix] = useState<any[]>([]);
	const [descricoesUnicas, setDescricoesUnicas] = useState<string[]>([]);

	const [modalVisible, setModalVisible] = useState(false);
	const [descricao, setDescricao] = useState("");
	const [valor, setValor] = useState("");

	const loadData = useCallback(async () => {
		setLoading(true);
		try {
			const {
				data: { user },
			} = await supabase.auth.getUser();
			if (!user) return;

			const { data } = await supabase
				.from("entradas")
				.select("descricao, valor, data")
				.eq("usuario_id", user.id)
				.gte("data", `${year}-01-01`)
				.lte("data", `${year}-12-31`);

			const matrix: any = {};
			const uniqueDescs = new Set<string>();

			data?.forEach((item) => {
				const mesIdx = new Date(item.data).getUTCMonth();
				uniqueDescs.add(item.descricao);
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
			setDescricoesUnicas(Array.from(uniqueDescs));
		} catch (e: any) {
			Alert.alert("Erro", e.message);
		} finally {
			setLoading(false);
		}
	}, [year]);

	useEffect(() => {
		loadData();
	}, [loadData]);

	async function handleSave() {
		try {
			const {
				data: { user },
			} = await supabase.auth.getUser();
			await supabase.from("entradas").insert([
				{
					usuario_id: user?.id,
					descricao,
					valor: Number(valor),
					data: new Date().toISOString().split("T")[0],
				},
			]);
			setModalVisible(false);
			setDescricao("");
			setValor("");
			loadData();
		} catch (e: any) {
			Alert.alert("Erro", e.message);
		}
	}

	return (
		<SafeAreaView style={tw`flex-1 bg-gray-50`}>
			<View
				style={tw`p-6 bg-white flex-row justify-between items-center shadow-sm`}>
				<Text style={tw`text-2xl font-bold text-green-800`}>
					Entradas {year}
				</Text>
				<View style={tw`flex-row`}>
					<TouchableOpacity onPress={() => setYear(year - 1)} style={tw`mr-4`}>
						<Text style={tw`text-xl`}>⬅️</Text>
					</TouchableOpacity>
					<TouchableOpacity onPress={() => setYear(year + 1)}>
						<Text style={tw`text-xl`}>➡️</Text>
					</TouchableOpacity>
				</View>
			</View>

			<ScrollView horizontal>
				<View>
					<View style={tw`flex-row bg-green-700 p-3`}>
						<Text style={tw`w-32 text-white font-bold`}>Descrição</Text>
						{MESES.map((m) => (
							<Text key={m} style={tw`w-20 text-white font-bold text-center`}>
								{m}
							</Text>
						))}
						<Text style={tw`w-24 text-white font-bold text-center`}>Média</Text>
					</View>
					<ScrollView>
						{loading ? (
							<ActivityIndicator style={tw`mt-10`} />
						) : (
							dataMatrix.map((row, i) => (
								<View
									key={i}
									style={tw`flex-row border-b border-gray-100 bg-white p-3`}>
									<Text style={tw`w-32 font-bold text-gray-700`}>
										{row.descricao}
									</Text>
									{row.valores.map((v: number, idx: number) => (
										<Text key={idx} style={tw`w-20 text-center text-gray-500`}>
											{v > 0 ? `R$${v}` : "-"}
										</Text>
									))}
									<Text style={tw`w-24 text-center font-bold text-green-700`}>
										R$ {row.media.toFixed(2)}
									</Text>
								</View>
							))
						)}
					</ScrollView>
				</View>
			</ScrollView>

			<TouchableOpacity
				onPress={() => setModalVisible(true)}
				style={tw`absolute bottom-8 right-8 bg-green-700 w-16 h-16 rounded-full justify-center items-center shadow-lg`}>
				<Text style={tw`text-white text-3xl`}>+</Text>
			</TouchableOpacity>

			<FinanceModal
				visible={modalVisible}
				type="entrada"
				title="Nova Entrada"
				descricao={descricao}
				setDescricao={setDescricao}
				valor={valor}
				setValor={setValor}
				sugestoes={descricoesUnicas}
				onClose={() => setModalVisible(false)}
				onSave={handleSave}
			/>
		</SafeAreaView>
	);
}
