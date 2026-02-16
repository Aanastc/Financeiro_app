import React, { useEffect, useState, useCallback } from "react";
import {
	View,
	Text,
	SafeAreaView,
	ScrollView,
	TouchableOpacity,
	Dimensions,
	ActivityIndicator,
} from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { supabase } from "../../../packages/services/supabase";
import { authService } from "../../../packages/services/auth.service";
import { financeService } from "../../../packages/services/finance.service";
import { PieChart } from "react-native-chart-kit";
import DateTimePicker from "@react-native-community/datetimepicker";
import tw from "twrnc";
import { NavBar } from "@/components/app_components/NavBar";
import {
	ArrowUpCircle,
	ArrowDownCircle,
	History,
	LogOut,
	Calendar,
	ChevronDown,
} from "lucide-react-native";

const screenWidth = Dimensions.get("window").width;

export default function Home() {
	const router = useRouter();
	const [nome, setNome] = useState("");
	const [loading, setLoading] = useState(true);
	const [date, setDate] = useState(new Date());
	const [showPicker, setShowPicker] = useState(false);

	// Estados Financeiros
	const [stats, setStats] = useState({ entradas: 0, gastos: 0 });
	const [yearStats, setYearStats] = useState({ entradas: 0, gastos: 0 });
	const [recentTransactions, setRecentTransactions] = useState<any[]>([]);

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
			const firstDayYear = new Date(
				selectedDate.getFullYear(),
				0,
				1,
			).toISOString();
			const lastDayYear = new Date(
				selectedDate.getFullYear(),
				11,
				31,
				23,
				59,
				59,
			).toISOString();

			const [monthly, yearly, recent] = await Promise.all([
				financeService.getMonthlyStats(user.id, firstDay, lastDay),
				financeService.getMonthlyStats(user.id, firstDayYear, lastDayYear),
				financeService.getRecentTransactions(user.id, 5),
			]);

			setStats({
				entradas: monthly.totalEntradas,
				gastos: monthly.totalGastos,
			});
			setYearStats({
				entradas: yearly.totalEntradas,
				gastos: yearly.totalGastos,
			});
			setRecentTransactions(recent || []);
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
			color: "#4CAF50",
			legendFontColor: "#5D4037",
			legendFontSize: 12,
		},
		{
			name: "Gastos",
			population: stats.gastos,
			color: "#FF80AB",
			legendFontColor: "#5D4037",
			legendFontSize: 12,
		},
	];

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
	const saldoMensal = stats.entradas - stats.gastos;

	return (
		<SafeAreaView style={tw`flex-1 bg-[#FCF8F8]`}>
			<NavBar />
			<ScrollView contentContainerStyle={tw`p-6 pb-20`}>
				{/* 1. CUMPRIMENTO DO USUÁRIO */}
				<View style={tw`mb-6`}>
					<Text style={tw`text-[#5D4037] text-lg font-medium`}>
						Olá, {nome} 💖
					</Text>
					<TouchableOpacity
						onPress={() => setShowPicker(true)}
						style={tw`flex-row items-center mt-1`}>
						<Text style={tw`text-3xl font-black text-[#5D4037]`}>
							{monthNames[date.getMonth()]}
						</Text>
						<ChevronDown size={24} color="#5D4037" style={tw`ml-1`} />
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

				{/* 2. SALDO POSITIVO/NEGATIVO DO MÊS ATUAL (CARD DE RESUMO) */}
				<View
					style={tw`bg-white p-6 rounded-[40px] shadow-sm mb-6 border border-gray-100`}>
					<View style={tw`flex-row justify-between items-center mb-4`}>
						<View>
							<Text style={tw`font-black text-[#5D4037] text-lg`}>
								Resumo Mensal
							</Text>
							<Text
								style={tw`text-sm font-bold ${saldoMensal >= 0 ? "text-[#4CAF50]" : "text-[#FF80AB]"}`}>
								{saldoMensal >= 0 ? "Saldo Positivo" : "Saldo Negativo"}: R${" "}
								{saldoMensal.toFixed(2)}
							</Text>
						</View>
						<View
							style={tw`${saldoMensal >= 0 ? "bg-green-50" : "bg-pink-50"} px-4 py-1.5 rounded-full`}>
							<Text
								style={tw`text-[10px] font-black ${saldoMensal >= 0 ? "text-[#4CAF50]" : "text-[#FF80AB]"}`}>
								{saldoMensal >= 0 ? "NO AZUL" : "NO VERMELHO"}
							</Text>
						</View>
					</View>

					{loading ? (
						<ActivityIndicator
							size="small"
							color="#5D4037"
							style={tw`h-[150px]`}
						/>
					) : stats.entradas > 0 || stats.gastos > 0 ? (
						<PieChart
							data={chartData}
							width={screenWidth - 80}
							height={150}
							chartConfig={{
								color: (opacity = 1) => `rgba(93, 64, 55, ${opacity})`,
							}}
							accessor={"population"}
							backgroundColor={"transparent"}
							paddingLeft={"15"}
							absolute
						/>
					) : (
						<View
							style={tw`h-[150px] justify-center items-center bg-[#FCF8F8] rounded-3xl`}>
							<Text style={tw`text-gray-400 italic`}>
								Nenhuma transação este mês
							</Text>
						</View>
					)}
				</View>

				{/* 3. VISUALIZAÇÃO DO ANO */}
				<View style={tw`bg-[#5D4037] p-6 rounded-[40px] shadow-lg mb-8`}>
					<View style={tw`flex-row items-center mb-4`}>
						<Calendar
							size={16}
							color="rgba(255,255,255,0.7)"
							style={tw`mr-2`}
						/>
						<Text
							style={tw`text-white/70 font-bold uppercase text-[10px] tracking-widest`}>
							Balanço de {date.getFullYear()}
						</Text>
					</View>
					<View style={tw`flex-row justify-between`}>
						<View>
							<Text style={tw`text-white/50 text-[10px] mb-1`}>ENTRADAS</Text>
							<Text style={tw`text-[#4CAF50] text-xl font-black`}>
								R$ {yearStats.entradas.toFixed(2)}
							</Text>
						</View>
						<View style={tw`items-end`}>
							<Text style={tw`text-white/50 text-[10px] mb-1`}>GASTOS</Text>
							<Text style={tw`text-[#FF80AB] text-xl font-black`}>
								R$ {yearStats.gastos.toFixed(2)}
							</Text>
						</View>
					</View>
				</View>

				{/* 4. BOTÕES DE ENTRADA E SAÍDA */}
				{/* <View style={tw`flex-row justify-between mb-8`}>
					<MenuButton
						title="Entradas"
						icon={<ArrowUpCircle color="#4CAF50" size={30} />}
						color="bg-white"
						textColor="text-[#4CAF50]"
						onPress={() => router.push("/finance/entradas")}
					/>
					<MenuButton
						title="Gastos"
						icon={<ArrowDownCircle color="#FF80AB" size={30} />}
						color="bg-white"
						textColor="text-[#FF80AB]"
						onPress={() => router.push("/finance/gastos")}
					/>
				</View> */}

				{/* 5. ÚLTIMOS 5 LANÇAMENTOS */}
				<View
					style={tw`bg-white p-6 rounded-[40px] shadow-sm mb-10 border border-gray-100`}>
					<View style={tw`flex-row items-center mb-5`}>
						<History size={20} color="#5D4037" style={tw`mr-2`} />
						<Text style={tw`font-black text-[#5D4037] text-lg`}>
							Atividade Recente
						</Text>
					</View>

					{recentTransactions.map((item, index) => (
						<View
							key={index}
							style={tw`flex-row justify-between items-center py-4 ${index !== recentTransactions.length - 1 ? "border-b border-gray-50" : ""}`}>
							<View style={tw`flex-1`}>
								<Text
									style={tw`text-[#5D4037] font-bold text-sm`}
									numberOfLines={1}>
									{item.descricao}
								</Text>
								<Text style={tw`text-gray-400 text-[10px]`}>
									{new Date(item.data).toLocaleDateString("pt-BR")}
								</Text>
							</View>
							<Text
								style={tw`font-black text-sm ${item.tipo === "entrada" ? "text-[#4CAF50]" : "text-[#FF80AB]"}`}>
								{item.tipo === "entrada" ? "+" : "-"} R$ {item.valor.toFixed(2)}
							</Text>
						</View>
					))}
					{recentTransactions.length === 0 && (
						<View style={tw`py-6 items-center`}>
							<Text style={tw`text-gray-300 italic text-sm`}>
								Nada por aqui ainda...
							</Text>
						</View>
					)}
				</View>

				{/* 6. SAIR */}
				<TouchableOpacity
					onPress={async () => {
						await authService.logout();
						router.replace("/user/login");
					}}
					style={tw`flex-row justify-center items-center mb-10 opacity-30`}>
					<LogOut size={16} color="#5D4037" style={tw`mr-2`} />
					<Text
						style={tw`text-[#5D4037] font-bold uppercase tracking-widest text-[10px]`}>
						Encerrar Sessão
					</Text>
				</TouchableOpacity>
			</ScrollView>
		</SafeAreaView>
	);
}

function MenuButton({ title, icon, color, textColor, onPress }: any) {
	return (
		<TouchableOpacity
			onPress={onPress}
			style={tw`${color} w-[48%] p-6 rounded-[35px] items-center shadow-sm border border-gray-50`}>
			<View style={tw`mb-2`}>{icon}</View>
			<Text
				style={tw`${textColor} font-black text-xs uppercase tracking-tighter`}>
				{title}
			</Text>
		</TouchableOpacity>
	);
}
