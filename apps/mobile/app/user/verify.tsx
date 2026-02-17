import React, { useState } from "react";
import {
	View,
	Text,
	TextInput,
	TouchableOpacity,
	Alert,
	ActivityIndicator,
	SafeAreaView,
	KeyboardAvoidingView,
	Platform,
	ScrollView,
	Keyboard,
} from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { authService } from "../../../../packages/services/auth.service";
import tw from "twrnc";
import { CheckCircle } from "lucide-react-native";

export default function VerifyToken() {
	const { email } = useLocalSearchParams();
	const [token, setToken] = useState("");
	const [loading, setLoading] = useState(false);
	const router = useRouter();

	async function handleVerify() {
		if (token.length < 6)
			return Alert.alert("Atenção", "O código tem 6 dígitos.");

		setLoading(true);
		try {
			await authService.verifyOtp(email as string, token);
			Alert.alert("Sucesso! 🎉", "E-mail confirmado. Bem-vindo!", [
				{ text: "Ir para Home", onPress: () => router.replace("/home") },
			]);
		} catch (error: any) {
			Alert.alert("Erro", "Código inválido ou expirado.");
		} finally {
			setLoading(false);
		}
	}

	return (
		<SafeAreaView style={tw`flex-1 bg-white`}>
			<KeyboardAvoidingView
				behavior={Platform.OS === "ios" ? "padding" : "height"}
				style={tw`flex-1`}
				// Ajuste de offset para garantir que o input não fique colado no teclado no iOS
				keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 20}>
				<ScrollView
					contentContainerStyle={tw`flex-grow px-8 pt-12 pb-10`}
					// Isso fecha o teclado ao arrastar a tela para baixo
					keyboardDismissMode="on-drag"
					// Isso permite clicar nos botões mesmo com o teclado aberto
					keyboardShouldPersistTaps="handled">
					{/* Header - Espaçamento flexível no topo */}
					<View style={tw`items-center mt-10 mb-10`}>
						<View style={tw`bg-green-50 p-4 rounded-full mb-4`}>
							<CheckCircle size={48} color="#4CAF50" />
						</View>
						<Text style={tw`text-3xl font-black text-[#5D4037]`}>
							Verificação
						</Text>
						<Text style={tw`text-gray-500 text-center mt-2`}>
							Digite o código de 6 dígitos enviado para:{"\n"}
							<Text style={tw`font-bold text-[#5D4037]`}>{email}</Text>
						</Text>
					</View>

					{/* Input Area */}
					<View style={tw`mb-4`}>
						<TextInput
							placeholder="000000"
							placeholderTextColor="#d1d5db"
							keyboardType="number-pad"
							maxLength={6}
							value={token}
							onChangeText={setToken}
							autoFocus={true} // Abre o teclado automaticamente
							style={tw`bg-[#FCF8F8] border border-gray-100 p-6 rounded-3xl text-center text-4xl font-black tracking-widest text-[#4CAF50] mb-6`}
						/>

						<TouchableOpacity
							onPress={handleVerify}
							disabled={loading}
							style={tw`bg-[#5D4037] p-5 rounded-3xl shadow-lg shadow-gray-200`}>
							{loading ? (
								<ActivityIndicator color="white" />
							) : (
								<Text style={tw`text-white text-center font-bold text-lg`}>
									CONFIRMAR E ENTRAR
								</Text>
							)}
						</TouchableOpacity>
					</View>

					{/* Footer Area */}
					<TouchableOpacity onPress={() => router.back()} style={tw`mt-4`}>
						<Text style={tw`text-center text-gray-400 font-medium`}>
							Não recebeu?{" "}
							<Text style={tw`text-[#4CAF50] font-bold`}>Tentar novamente</Text>
						</Text>
					</TouchableOpacity>
				</ScrollView>
			</KeyboardAvoidingView>
		</SafeAreaView>
	);
}
