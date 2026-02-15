import React, { useEffect, useState, useCallback } from "react";
import {
	View,
	Text,
	SafeAreaView,
	ScrollView,
	TouchableOpacity,
	Dimensions,
	ActivityIndicator,
	Platform,
} from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { supabase } from "../../../packages/services/supabase";
import { authService } from "../../../packages/services/auth.service";
import { financeService } from "../../../packages/services/finance.service";
import { PieChart } from "react-native-chart-kit";
import DateTimePicker from "@react-native-community/datetimepicker";
import tw from "twrnc";

const screenWidth = Dimensions.get("window").width;

export default function Home() {
	const router = useRouter();
	const [nome, setNome] = useState("");
	const [loading, setLoading] = useState(true);
	const [date, setDate] = useState(new Date());
	const [showPicker, setShowPicker] = useState(false);

	// Estados Financeiros (Apenas Entradas e Gastos)
	const [stats, setStats] = useState({ entradas: 0, gastos: 0 });
	const [averages, setAverages] = useState({ entradas: 0, gastos: 0 });

	useEffect(() => {
		async function getUserName() {
			const user = await authService.getCurrentUser();
			if (user) setNome(user.nome);
		}
		getUserName();
	}, []);

	useFocusEffect(
		useCallback(() => {
			fetchFinancialData(date);
		}, [date]),
	);

	async function fetchFinancialData(selectedDate: Date) {
		setLoading(true);
		try {
			const {
				data: { user },
			} = await supabase.auth.getUser();
			if (!user) return;

			const firstDay = new Date(
				selectedDate.getFullYear(),
				selectedDate.getMonth(),
				1,
			).toISOString();
			const lastDay = new Date(
				selectedDate.getFullYear(),
				selectedDate.getMonth() + 1,
				0,
				23,
				59,
				59,
			).toISOString();

			const result = await financeService.getMonthlyStats(
				user.id,
				firstDay,
				lastDay,
			);

			setStats({
				entradas: result.totalEntradas,
				gastos: result.totalGastos,
			});

			setAverages({
				entradas: result.mediaEntradas,
				gastos: result.mediaGastos,
			});
		} catch (e) {
			console.error(e);
		} finally {
			setLoading(false);
		}
	}

	const chartData = [
		{
			name: "Entradas",
			population: stats.entradas,
			color: "#16a34a",
			legendFontColor: "#7f7f7f",
			legendFontSize: 12,
		},
		{
			name: "Gastos",
			population: stats.gastos,
			color: "#dc2626",
			legendFontColor: "#7f7f7f",
			legendFontSize: 12,
		},
	];

	const hasData = stats.entradas > 0 || stats.gastos > 0;
	const monthNames = [
		"Janeiro",
		"Fevereiro",
		"Março",
		"Abril",
		"Maio",
		"Junho",
		"Julho",
		"Agosto",
		"Setembro",
		"Outubro",
		"Novembro",
		"Dezembro",
	];

	return (
		<SafeAreaView style={tw`flex-1 bg-gray-50`}>
			<ScrollView contentContainerStyle={tw`p-6`}>
				{/* Header */}
				<View style={tw`flex-row justify-between items-center mb-8`}>
					<View>
						<Text style={tw`text-gray-500`}>Olá, {nome} 💖</Text>
						<TouchableOpacity onPress={() => setShowPicker(true)}>
							<Text style={tw`text-2xl font-bold text-red-900`}>
								{monthNames[date.getMonth()]} / {date.getFullYear()} ▾
							</Text>
						</TouchableOpacity>
					</View>
					<TouchableOpacity
						onPress={() => setDate(new Date())}
						style={tw`bg-red-50 px-3 py-2 rounded-xl`}>
						<Text style={tw`text-red-800 text-xs font-bold`}>Hoje</Text>
					</TouchableOpacity>
				</View>

				{showPicker && (
					<DateTimePicker
						value={date}
						mode="date"
						display="default"
						onChange={(e, d) => {
							setShowPicker(false);
							if (d) setDate(d);
						}}
					/>
				)}

				{/* Card Principal: Saldo e Gráfico */}
				<View style={tw`bg-white p-6 rounded-3xl shadow-sm mb-6`}>
					<View style={tw`flex-row justify-between mb-6`}>
						<Text style={tw`font-bold text-gray-800 text-lg`}>
							Resumo Mensal
						</Text>
						<Text
							style={tw`font-bold ${stats.entradas - stats.gastos >= 0 ? "text-green-600" : "text-red-600"}`}>
							Saldo: R$ {(stats.entradas - stats.gastos).toFixed(2)}
						</Text>
					</View>

					{loading ? (
						<ActivityIndicator
							size="small"
							color="#991b1b"
							style={tw`h-[180px]`}
						/>
					) : hasData ? (
						<PieChart
							data={chartData}
							width={screenWidth - 80}
							height={180}
							chartConfig={{
								color: (opacity = 1) => `rgba(0, 0, 0, ${opacity})`,
							}}
							accessor={"population"}
							backgroundColor={"transparent"}
							paddingLeft={"15"}
							absolute
						/>
					) : (
						<View
							style={tw`h-[180px] justify-center items-center bg-gray-50 rounded-2xl`}>
							<Text style={tw`text-gray-400 italic`}>
								Nenhum registro em {monthNames[date.getMonth()]}
							</Text>
						</View>
					)}
				</View>

				{/* Cards de Médias */}
				<View style={tw`flex-row justify-between mb-8`}>
					<View
						style={tw`bg-white p-4 rounded-2xl w-[48%] shadow-sm border-l-4 border-green-600`}>
						<Text style={tw`text-gray-400 text-xs uppercase font-bold`}>
							Média Recebida
						</Text>
						<Text style={tw`text-lg font-bold text-gray-800`}>
							R$ {averages.entradas.toFixed(2)}
						</Text>
					</View>

					<View
						style={tw`bg-white p-4 rounded-2xl w-[48%] shadow-sm border-l-4 border-red-600`}>
						<Text style={tw`text-gray-400 text-xs uppercase font-bold`}>
							Média Gasta
						</Text>
						<Text style={tw`text-lg font-bold text-gray-800`}>
							R$ {averages.gastos.toFixed(2)}
						</Text>
					</View>
				</View>

				{/* Ações Rápidas */}
				<View style={tw`flex-row justify-between`}>
					<MenuButton
						title="Entradas"
						icon="💰"
						color="bg-green-100"
						textColor="text-green-800"
						onPress={() => router.push("/finance/entradas")}
					/>
					<MenuButton
						title="Gastos"
						icon="📉"
						color="bg-red-100"
						textColor="text-red-800"
						onPress={() => router.push("/finance/gastos")}
					/>
				</View>

				{/* <TouchableOpacity
					onPress={() => router.push("/finance/metas")}
					style={tw`bg-blue-100 p-5 rounded-3xl mt-2 flex-row justify-center items-center shadow-sm`}>
					<Text style={tw`text-2xl mr-3`}>🎯</Text>
					<Text style={tw`text-blue-800 font-bold text-lg`}>Minhas Metas</Text>
				</TouchableOpacity> */}

				<TouchableOpacity
					onPress={async () => {
						await authService.logout();
						router.replace("/user/login");
					}}
					style={tw`mt-12 mb-10 items-center`}>
					<Text style={tw`text-gray-300 font-bold`}>Sair da conta</Text>
				</TouchableOpacity>
			</ScrollView>
		</SafeAreaView>
	);
}

function MenuButton({ title, icon, color, textColor, onPress }: any) {
	return (
		<TouchableOpacity
			onPress={onPress}
			style={tw`${color} w-[48%] p-8 rounded-3xl items-center shadow-sm`}>
			<Text style={tw`text-4xl mb-2`}>{icon}</Text>
			<Text style={tw`${textColor} font-bold text-lg`}>{title}</Text>
		</TouchableOpacity>
	);
}
