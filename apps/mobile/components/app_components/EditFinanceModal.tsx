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
	ActivityIndicator,
} from "react-native";
import tw from "twrnc";
import { Trash2, Calendar, ChevronDown } from "lucide-react-native";

interface EditFinanceModalProps {
	visible: boolean;
	onClose: () => void;
	onSave: (id: string, novoValor: string) => void;
	onDelete: (id: string) => void;
	type: "entrada" | "gasto";
	lancamentos: any[]; // Todos os lançamentos do ano para filtrar
	loading?: boolean;
}

export function EditFinanceModal({
	visible,
	onClose,
	onSave,
	onDelete,
	type,
	lancamentos,
	loading,
}: EditFinanceModalProps) {
	const isEntrada = type === "entrada";
	const colorBase = isEntrada ? "green" : "red";

	const [descSelecionada, setDescSelecionada] = useState("");
	const [dataSelecionada, setDataSelecionada] = useState<any>(null);
	const [novoValor, setNovoValor] = useState("");

	// Lista de descrições únicas para o filtro
	const descricoesUnicas = Array.from(
		new Set(lancamentos.map((l) => l.descricao)),
	);

	// Filtra as datas disponíveis para a descrição selecionada
	const datasDisponiveis = lancamentos.filter(
		(l) => l.descricao === descSelecionada,
	);

	// Quando mudar a descrição, reseta a data e o valor
	useEffect(() => {
		setDataSelecionada(null);
		setNovoValor("");
	}, [descSelecionada]);

	// Quando selecionar a data, preenche o valor atual
	const handleSelectData = (item: any) => {
		setDataSelecionada(item);
		setNovoValor(item.valor.toString());
	};

	return (
		<Modal visible={visible} animationType="slide" transparent>
			<TouchableWithoutFeedback onPress={Keyboard.dismiss}>
				<View style={tw`flex-1 justify-end bg-black/50`}>
					<KeyboardAvoidingView
						behavior={Platform.OS === "ios" ? "padding" : "height"}>
						<View style={tw`bg-white p-8 rounded-t-[40px] shadow-lg`}>
							<View style={tw`flex-row justify-between items-center mb-6`}>
								<Text style={tw`text-xl font-black text-[#5D4037]`}>
									Editar Lançamento
								</Text>
								<TouchableOpacity onPress={onClose} style={tw`p-2`}>
									<Text style={tw`text-gray-400 font-bold`}>✕</Text>
								</TouchableOpacity>
							</View>

							{/* PASSO 1: SELECIONAR DESCRIÇÃO */}
							<Text
								style={tw`text-gray-400 text-[10px] mb-2 uppercase font-black tracking-widest`}>
								1. Escolha a Descrição
							</Text>
							<View style={tw`h-12 mb-6`}>
								<ScrollView horizontal showsHorizontalScrollIndicator={false}>
									{descricoesUnicas.map((d) => (
										<TouchableOpacity
											key={d}
											onPress={() => setDescSelecionada(d)}
											style={tw`px-5 py-2 rounded-full mr-2 h-10 border flex-row items-center ${descSelecionada === d ? `bg-[#5D4037] border-[#5D4037]` : "bg-gray-50 border-gray-200"}`}>
											<Text
												style={tw`${descSelecionada === d ? `text-white font-bold` : "text-gray-500"}`}>
												{d}
											</Text>
										</TouchableOpacity>
									))}
								</ScrollView>
							</View>

							{/* PASSO 2: SELECIONAR A DATA (Se a descrição foi escolhida) */}
							{descSelecionada !== "" && (
								<>
									<Text
										style={tw`text-gray-400 text-[10px] mb-2 uppercase font-black tracking-widest`}>
										2. Selecione a Data
									</Text>
									<View style={tw`h-14 mb-6`}>
										<ScrollView
											horizontal
											showsHorizontalScrollIndicator={false}>
											{datasDisponiveis.map((item) => (
												<TouchableOpacity
													key={item.id}
													onPress={() => handleSelectData(item)}
													style={tw`px-4 py-2 rounded-2xl mr-2 border items-center justify-center ${dataSelecionada?.id === item.id ? `border-${colorBase}-500 bg-${colorBase}-50` : "border-gray-100 bg-gray-50"}`}>
													<Calendar
														size={12}
														color={
															dataSelecionada?.id === item.id
																? isEntrada
																	? "#4CAF50"
																	: "#FF80AB"
																: "#999"
														}
													/>
													<Text
														style={tw`text-[10px] font-bold ${dataSelecionada?.id === item.id ? `text-${colorBase}-700` : "text-gray-500"}`}>
														{new Date(item.data).toLocaleDateString("pt-BR")}
													</Text>
												</TouchableOpacity>
											))}
										</ScrollView>
									</View>
								</>
							)}

							{/* PASSO 3: EDITAR VALOR OU EXCLUIR */}
							{dataSelecionada && (
								<View style={tw`mt-2`}>
									<Text
										style={tw`text-gray-400 text-[10px] mb-2 uppercase font-black tracking-widest`}>
										3. Alterar Valor
									</Text>
									<View
										style={tw`flex-row items-center bg-gray-50 p-4 rounded-2xl border border-gray-200`}>
										<Text style={tw`text-[#5D4037] font-black mr-2`}>R$</Text>
										<TextInput
											keyboardType="numeric"
											value={novoValor}
											onChangeText={setNovoValor}
											style={tw`flex-1 font-black text-lg text-${colorBase}-700`}
										/>
									</View>

									<View style={tw`flex-row gap-x-3 mt-8`}>
										<TouchableOpacity
											onPress={() => onSave(dataSelecionada.id, novoValor)}
											disabled={loading}
											style={tw`flex-1 bg-${colorBase}-600 p-5 rounded-2xl shadow-md flex-row justify-center items-center`}>
											{loading ? (
												<ActivityIndicator color="white" />
											) : (
												<Text style={tw`text-white font-black text-center`}>
													SALVAR ALTERAÇÃO
												</Text>
											)}
										</TouchableOpacity>

										<TouchableOpacity
											onPress={() => onDelete(dataSelecionada.id)}
											style={tw`bg-pink-50 p-5 rounded-2xl border border-pink-100`}>
											<Trash2 size={24} color="#FF80AB" />
										</TouchableOpacity>
									</View>
								</View>
							)}
						</View>
					</KeyboardAvoidingView>
				</View>
			</TouchableWithoutFeedback>
		</Modal>
	);
}
