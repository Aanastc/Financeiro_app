import React, { useState } from "react";
import {
	View,
	Text,
	TextInput,
	TouchableOpacity,
	Alert,
	ActivityIndicator,
	SafeAreaView,
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
			// Valida o Token e gera a sessão automaticamente
			await authService.verifyOtp(email as string, token);

			Alert.alert("Sucesso! 🎉", "E-mail confirmado. Bem-vindo!", [
				{ text: "Ir para Home", onPress: () => router.replace("/(tabs)/home") },
			]);
		} catch (error: any) {
			Alert.alert("Erro", "Código inválido ou expirado.");
		} finally {
			setLoading(false);
		}
	}

	return (
		<SafeAreaView style={tw`flex-1 bg-white px-8 justify-center`}>
			<View style={tw`items-center mb-10`}>
				<View style={tw`bg-green-50 p-4 rounded-full mb-4`}>
					<CheckCircle size={48} color="#4CAF50" />
				</View>
				<Text style={tw`text-3xl font-black text-[#5D4037]`}>Verificação</Text>
				<Text style={tw`text-gray-500 text-center mt-2`}>
					Digitie o código de 6 dígitos enviado para:{"\n"}
					<Text style={tw`font-bold text-[#5D4037]`}>{email}</Text>
				</Text>
			</View>

			<TextInput
				placeholder="000000"
				placeholderTextColor="#d1d5db"
				keyboardType="number-pad"
				maxLength={6}
				value={token}
				onChangeText={setToken}
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

			<TouchableOpacity onPress={() => router.back()} style={tw`mt-6`}>
				<Text style={tw`text-center text-gray-400 font-medium`}>
					Não recebeu?{" "}
					<Text style={tw`text-[#4CAF50] font-bold`}>Tentar novamente</Text>
				</Text>
			</TouchableOpacity>
		</SafeAreaView>
	);
}
