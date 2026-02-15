import React from "react";
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

// Adicionamos o ReactNode para o children
interface FinanceModalProps {
	visible: boolean;
	onClose: () => void;
	onSave: () => void;
	title: string;
	type: "entrada" | "gasto";
	descricao: string;
	setDescricao: (val: string) => void;
	valor: string;
	setValor: (val: string) => void;
	loading?: boolean;
	sugestoes: string[];
	children?: React.ReactNode; // <--- A correção está aqui
}

export function FinanceModal({
	visible,
	onClose,
	onSave,
	title,
	type,
	descricao,
	setDescricao,
	valor,
	setValor,
	loading,
	sugestoes,
	children, // <--- Pegamos o children aqui
}: FinanceModalProps) {
	const isEntrada = type === "entrada";
	const colorBase = isEntrada ? "green" : "red";

	return (
		<Modal visible={visible} animationType="slide" transparent>
			<TouchableWithoutFeedback onPress={Keyboard.dismiss}>
				<View style={tw`flex-1 justify-end bg-black/50`}>
					<KeyboardAvoidingView
						behavior={Platform.OS === "ios" ? "padding" : "height"}
						style={tw`w-full`}>
						<View style={tw`bg-white p-8 rounded-t-3xl shadow-lg`}>
							<View style={tw`flex-row justify-between items-center mb-6`}>
								<Text style={tw`text-xl font-bold text-gray-800`}>{title}</Text>
								<TouchableOpacity onPress={onClose}>
									<Text style={tw`text-gray-400 text-lg`}>✕</Text>
								</TouchableOpacity>
							</View>

							<Text
								style={tw`text-gray-400 text-xs mb-2 ml-1 uppercase font-bold`}>
								Sugestões anteriores
							</Text>

							<View style={tw`h-12 mb-4`}>
								<ScrollView horizontal showsHorizontalScrollIndicator={false}>
									{sugestoes.map((s) => (
										<TouchableOpacity
											key={s}
											onPress={() => setDescricao(s)}
											style={tw`bg-gray-100 px-4 py-2 rounded-full mr-2 h-10 border ${descricao === s ? `border-${colorBase}-600` : "border-transparent"}`}>
											<Text
												style={tw`${descricao === s ? `text-${colorBase}-700 font-bold` : "text-gray-600"}`}>
												{s}
											</Text>
										</TouchableOpacity>
									))}
								</ScrollView>
							</View>

							<View style={tw`gap-y-4`}>
								<View>
									<Text
										style={tw`text-gray-400 text-xs mb-1 ml-1 uppercase font-bold`}>
										Descrição
									</Text>
									<TextInput
										placeholder={
											isEntrada
												? "Ex: Salário, Freelance..."
												: "Ex: Mercado, Aluguel..."
										}
										value={descricao}
										onChangeText={setDescricao}
										style={tw`bg-gray-50 border border-gray-200 p-4 rounded-xl text-gray-800`}
									/>
								</View>

								<View>
									<Text
										style={tw`text-gray-400 text-xs mb-1 ml-1 uppercase font-bold`}>
										Valor (R$)
									</Text>
									<TextInput
										placeholder="0.00"
										keyboardType="numeric"
										value={valor}
										onChangeText={setValor}
										style={tw`bg-gray-50 border border-gray-200 p-4 rounded-xl text-gray-800`}
									/>
								</View>
							</View>

							{/* RENDERIZA O SELETOR DE CATEGORIAS AQUI (SE EXISTIR) */}
							{children && <View style={tw`mt-4`}>{children}</View>}

							<TouchableOpacity
								onPress={onSave}
								disabled={loading}
								style={tw`bg-${colorBase}-700 p-5 rounded-2xl mt-8 shadow-md`}>
								{loading ? (
									<ActivityIndicator color="white" />
								) : (
									<Text style={tw`text-white text-center font-bold text-lg`}>
										Salvar {isEntrada ? "Entrada" : "Gasto"}
									</Text>
								)}
							</TouchableOpacity>
						</View>
					</KeyboardAvoidingView>
				</View>
			</TouchableWithoutFeedback>
		</Modal>
	);
}
