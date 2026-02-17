import React, { useState, useEffect } from "react";
import {
	View,
	Text,
	TextInput,
	TouchableOpacity,
	Modal,
	KeyboardAvoidingView,
	Platform,
	TouchableWithoutFeedback,
	Keyboard,
	ScrollView,
} from "react-native";
import tw from "twrnc";
import {
	X,
	ShoppingBag,
	ChevronDown,
	Calendar as CalendarIcon,
} from "lucide-react-native";
import DateTimePicker from "@react-native-community/datetimepicker";

const CATEGORIAS_PADRAO = [
	"Moradia",
	"Alimentação",
	"Transporte",
	"Saúde",
	"Lazer",
	"Educação",
	"Assinaturas",
	"Outros",
];
const TIPOS_PADRAO = ["Essencial", "Lazer", "Reserva"];

export function FinanceModal({
	visible,
	onClose,
	onSave,
	sugestoes = [],
}: any) {
	const [form, setForm] = useState({
		descricao: "",
		valor: "",
		data: new Date(),
		categoria: "Outros",
		classificacao: "Variável",
		tipo: "Essencial",
	});

	const [showSugestoes, setShowSugestoes] = useState(false);
	const [showDatePicker, setShowDatePicker] = useState(false);

	useEffect(() => {
		if (visible) {
			setForm({
				descricao: "",
				valor: "",
				data: new Date(),
				categoria: "Outros",
				classificacao: "Variável",
				tipo: "Essencial",
			});
		}
	}, [visible]);

	const onDateChange = (event: any, selectedDate?: Date) => {
		setShowDatePicker(false);
		if (selectedDate) {
			setForm({ ...form, data: selectedDate });
		}
	};

	const handleSave = () => {
		if (!form.descricao || !form.valor)
			return alert("Preencha descrição e valor!");

		// Converte a data para string YYYY-MM-DD antes de salvar
		const dataString = form.data.toISOString().split("T")[0];
		onSave({ ...form, data: dataString });
	};

	return (
		<Modal visible={visible} animationType="slide" transparent>
			<TouchableWithoutFeedback
				onPress={() => {
					Keyboard.dismiss();
					setShowSugestoes(false);
				}}>
				<View style={tw`flex-1 justify-end bg-black/50`}>
					<KeyboardAvoidingView
						behavior={Platform.OS === "ios" ? "padding" : "height"}>
						<View style={tw`bg-white rounded-t-[40px] shadow-2xl max-h-[90%]`}>
							<View
								style={tw`p-6 bg-pink-400 flex-row justify-between items-center`}>
								<View style={tw`flex-row items-center gap-x-2`}>
									<ShoppingBag color="white" size={24} />
									<Text style={tw`text-xl font-black text-white`}>
										Novo Gasto
									</Text>
								</View>
								<TouchableOpacity onPress={onClose}>
									<X color="white" size={24} />
								</TouchableOpacity>
							</View>

							<ScrollView
								style={tw`p-6`}
								contentContainerStyle={tw`pb-10`}
								keyboardShouldPersistTaps="handled">
								{/* DESCRIÇÃO */}
								<Text
									style={tw`text-[10px] font-black text-gray-400 uppercase mb-1 ml-2`}>
									Descrição
								</Text>
								<View style={tw`relative mb-4`}>
									<TextInput
										style={tw`w-full p-4 bg-[#FCF8F8] rounded-2xl font-bold text-[#5D4037]`}
										placeholder="O que você comprou?"
										value={form.descricao}
										onFocus={() => setShowSugestoes(true)}
										onChangeText={(t) => setForm({ ...form, descricao: t })}
									/>
									{showSugestoes && sugestoes.length > 0 && (
										<View
											style={tw`absolute top-16 left-0 right-0 z-50 bg-white border-2 border-pink-50 rounded-2xl shadow-xl max-h-40`}>
											<ScrollView
												nestedScrollEnabled
												keyboardShouldPersistTaps="handled">
												{sugestoes.map((s: string, i: number) => (
													<TouchableOpacity
														key={i}
														style={tw`p-4 border-b border-gray-50`}
														onPress={() => {
															setForm({ ...form, descricao: s });
															setShowSugestoes(false);
															Keyboard.dismiss();
														}}>
														<Text style={tw`font-bold text-[#5D4037]`}>
															{s}
														</Text>
													</TouchableOpacity>
												))}
											</ScrollView>
										</View>
									)}
								</View>

								{/* VALOR E DATA PICKER */}
								<View style={tw`flex-row gap-x-3 mb-5`}>
									<View style={tw`flex-1`}>
										<Text
											style={tw`text-[10px] font-black text-gray-400 uppercase mb-1 ml-2`}>
											Valor
										</Text>
										<TextInput
											style={tw`p-4 bg-[#FCF8F8] rounded-2xl font-black text-pink-500 text-xl`}
											placeholder="0.00"
											keyboardType="numeric"
											value={form.valor}
											onChangeText={(t) => setForm({ ...form, valor: t })}
										/>
									</View>
									<View style={tw`flex-1`}>
										<Text
											style={tw`text-[10px] font-black text-gray-400 uppercase mb-1 ml-2`}>
											Data
										</Text>
										<TouchableOpacity
											onPress={() => setShowDatePicker(true)}
											style={tw`p-4 bg-[#FCF8F8] rounded-2xl flex-row items-center justify-between`}>
											<Text style={tw`font-bold text-[#5D4037]`}>
												{form.data.toLocaleDateString("pt-BR")}
											</Text>
											<CalendarIcon size={18} color="#FF80AB" />
										</TouchableOpacity>
									</View>
								</View>

								{showDatePicker && (
									<DateTimePicker
										value={form.data}
										mode="date"
										display={Platform.OS === "ios" ? "spinner" : "default"}
										onChange={onDateChange}
									/>
								)}

								{/* CLASSIFICAÇÃO */}
								<Text
									style={tw`text-[10px] font-black text-gray-400 uppercase mb-2 ml-2`}>
									Classificação / Tipo
								</Text>
								<View style={tw`flex-row gap-x-2 mb-5`}>
									{["Fixo", "Variável"].map((opt) => (
										<TouchableOpacity
											key={opt}
											onPress={() => setForm({ ...form, classificacao: opt })}
											style={tw`flex-1 p-3 rounded-xl items-center ${form.classificacao === opt ? "bg-[#5D4037]" : "bg-gray-100"}`}>
											<Text
												style={tw`font-bold text-xs ${form.classificacao === opt ? "text-white" : "text-gray-400"}`}>
												{opt}
											</Text>
										</TouchableOpacity>
									))}
								</View>

								{/* CATEGORIAS (LISTA COMPLETA EM CHIPS) */}
								<Text
									style={tw`text-[10px] font-black text-gray-400 uppercase mb-2 ml-2`}>
									Categoria
								</Text>
								<View style={tw`flex-row flex-wrap gap-2 mb-6`}>
									{CATEGORIAS_PADRAO.map((c) => (
										<TouchableOpacity
											key={c}
											onPress={() => setForm({ ...form, categoria: c })}
											style={tw`px-4 py-2 rounded-full border ${form.categoria === c ? "bg-pink-100 border-pink-400" : "bg-white border-gray-200"}`}>
											<Text
												style={tw`font-bold text-[10px] ${form.categoria === c ? "text-pink-600" : "text-gray-500"}`}>
												{c}
											</Text>
										</TouchableOpacity>
									))}
								</View>

								<TouchableOpacity
									onPress={handleSave}
									style={tw`w-full bg-[#5D4037] p-5 rounded-2xl items-center shadow-lg mb-4`}>
									<Text style={tw`text-white font-black text-lg`}>
										SALVAR REGISTRO
									</Text>
								</TouchableOpacity>
							</ScrollView>
						</View>
					</KeyboardAvoidingView>
				</View>
			</TouchableWithoutFeedback>
		</Modal>
	);
}
